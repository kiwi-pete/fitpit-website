import nodemailer from 'nodemailer';
import { syncMemberToGymManager } from './_gym-manager.js';

// Who is told about a new sign-up: the owner and the front desk's shared inbox (the reception
// "Admins" login), so the desk knows to expect them and take the first payment. Override with
// SIGNUP_NOTIFY_EMAILS (comma-separated) in Vercel.
const SIGNUP_NOTIFY_EMAILS = (process.env.SIGNUP_NOTIFY_EMAILS || 'petergrant01@gmail.com,fitpitadmins@gmail.com')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

// One-line summary of the Gym Manager sync result for the admin email.
function gymManagerSummary(gm) {
  const shared = gm && gm.sharedWith
    ? ` Note: ${gm.sharedWith.name} (id ${gm.sharedWith.id}) uses the same ${gm.sharedWith.matchedOn === 'email' ? 'email address' : 'phone number'}. Check they are two different people.`
    : '';
  return gymManagerStatus(gm) + shared;
}

function gymManagerStatus(gm) {
  switch (gm && gm.status) {
    case 'already_submitted':
      return `Already created from this same form (id ${gm.memberId}).`;
    case 'created':
      return `Created as an INACTIVE, UNPAID member (id ${gm.memberId}). The signed agreement PDF is attached to their account. They are listed on the Gym Manager Dashboard under "Signed up, not paid yet". Use "Renew / Add Payment" to activate them once payment is received.`;
    case 'created_without_agreement':
      return `Created as an INACTIVE, UNPAID member (id ${gm.memberId}), but the agreement PDF could not be attached automatically — please attach it manually from this email.`;
    case 'duplicate':
      return `Already a member: ${gm.name} (id ${gm.memberId}) has the same first name and ${gm.matchedOn === 'email' ? 'email address' : 'phone number'}, so no new member was created. Take their payment with "Renew / Add Payment" on their existing record.`;
    case 'skipped':
      return `Not created automatically (${gm.reason || 'skipped'}). Please add the member manually if needed.`;
    case 'error':
      return `Automatic creation failed (${gm.message || 'unknown error'}). Please add the member manually.`;
    default:
      return 'Not created automatically. Please add the member manually if needed.';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      first_name,
      last_name,
      email,
      phone,
      membership_term,
      membership_start_date,
      copy_of_id,
      signature,
      date_of_signing
    } = req.body;

    // Validation. The photo ID is optional: a member whose phone or connection can't send
    // it signs up without it and shows the ID at the front desk (see `hasId` below).
    if (!first_name || !last_name || !email || !phone || !membership_term || !membership_start_date || !signature || !date_of_signing) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const hasId = !!(copy_of_id && copy_of_id.base64);
    // Gym Manager needs a real last name and a phone number with digits ("-" or "n/a" don't count).
    if (!String(first_name).trim() || !String(last_name).trim()) {
      return res.status(400).json({ error: 'Please enter your first and last name.' });
    }
    if (!/\d/.test(String(phone))) {
      return res.status(400).json({ error: 'Please enter a phone number.' });
    }

    // Create the new member in the shared "Gym Manager" app (unpaid, with the
    // signed agreement attached). Best-effort: any failure is logged and the
    // visitor's confirmation + the notification email still proceed.
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const agreementBaseUrl = host ? `${proto}://${host}/membership-agreement.pdf` : null;
    let gymManager = { status: 'skipped' };
    try {
      gymManager = await syncMemberToGymManager(req.body, agreementBaseUrl);
      console.log('Gym Manager sync result:', gymManager);
    } catch (err) {
      console.error('Gym Manager sync error:', err);
      gymManager = { status: 'error', message: String(err.message || err) };
    }

    // The phone re-sends the form when the connection drops before our reply arrives. If
    // this exact sign-up already went through, confirm it and don't email everyone twice.
    if (gymManager.status === 'already_submitted') {
      return res.status(200).json({ success: true, message: 'Agreement already received.', gymManager });
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    const mailOptions = {
      from: SMTP_USER || 'no-reply@fitpitznz.com',
      to: SIGNUP_NOTIFY_EMAILS,
      subject: `New Membership Agreement: ${first_name} ${last_name}`,
      text: `
A new Fit Pit Membership Agreement has been submitted.

Member Information:
-------------------
First Name: ${first_name}
Last Name: ${last_name}
Email: ${email}
Phone: ${phone}

Membership Details:
-------------------
Membership Term: ${membership_term}
Membership Start Date: ${membership_start_date}

Signing Details:
----------------
Date of Signing: ${date_of_signing}
Signature Mode: ${signature.type === 'draw' ? 'Drawn signature (attached as signature.png)' : 'Typed signature'}
${signature.type === 'type' ? `Signature Text: ${signature.data}` : ''}
ID Document: ${hasId
  ? `Attached as ID file (${copy_of_id.filename})`
  : 'NOT PROVIDED — the member could not upload it. Check their photo ID at the front desk and add it to their profile in Gym Manager.'}

Gym Manager Account:
--------------------
${gymManagerSummary(gymManager)}

Best regards,
Fit Pit ZNZ Website
      `,
      attachments: []
    };

    // Attach Government ID
    if (hasId) {
      const idBase64Data = copy_of_id.base64.split(';base64,').pop();
      mailOptions.attachments.push({
        filename: copy_of_id.filename || 'government_id',
        content: Buffer.from(idBase64Data, 'base64'),
        contentType: copy_of_id.mimeType
      });
    }

    // Attach Drawn Signature
    if (signature && signature.type === 'draw' && signature.data) {
      const sigBase64Data = signature.data.split(';base64,').pop();
      mailOptions.attachments.push({
        filename: 'signature.png',
        content: Buffer.from(sigBase64Data, 'base64'),
        contentType: 'image/png'
      });
    }

    // Check if SMTP environment variables are defined
    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT || '587'),
        secure: parseInt(SMTP_PORT || '587') === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });

      // Send email to admin
      await transporter.sendMail(mailOptions);

      // Send confirmation email to client
      const clientMailOptions = {
        from: SMTP_USER,
        to: email,
        subject: 'Fit Pit ZNZ — Membership Agreement Received',
        text: `
Dear ${first_name},

Thank you for completing your Fit Pit Membership Agreement! We have successfully received your registration.

Here are the details you submitted:
- Term: ${membership_term}
- Start Date: ${membership_start_date}

${hasId
  ? 'Our team is currently reviewing your photo ID and membership agreement form. We will contact you shortly to finalize your registration and payment.'
  : 'Our team is currently reviewing your membership agreement form. Your photo ID was not included, so please show it at the front desk on your first visit. We will contact you shortly to finalize your registration and payment.'}

If you have any questions, feel free to reply to this email or send us a message on WhatsApp (+255 779 630 403).

Best regards,
The Fit Pit Team
Zanzibar Sporting Club, Cairo/Kiwengwa
        `
      };
      await transporter.sendMail(clientMailOptions);

      console.log(`Membership agreement emails dispatched successfully to admin and ${email}.`);
      return res.status(200).json({ success: true, message: 'Agreement submitted and emails dispatched successfully.', gymManager });
    } else {
      console.warn('WARNING: SMTP Environment variables are not set. Logging agreement payload directly (Dry-Run Mode):');
      console.log('Agreement Fields:', { first_name, last_name, email, phone, membership_term, membership_start_date, date_of_signing });
      console.log('ID Attachment Name:', hasId ? copy_of_id.filename : '(not provided)');
      console.log('Signature Type:', signature.type);
      if (signature.type === 'type') console.log('Typed Signature Text:', signature.data);
      
      return res.status(200).json({
        success: true,
        message: 'Agreement received successfully (dry-run). To enable real email delivery, configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in your Vercel project settings.',
        gymManager
      });
    }
  } catch (error) {
    console.error('Error processing membership agreement:', error);
    return res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
}
