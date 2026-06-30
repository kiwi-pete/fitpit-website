import nodemailer from 'nodemailer';
import { syncMemberToGymManager } from './_gym-manager.js';

// One-line summary of the Gym Manager sync result for the admin email.
function gymManagerSummary(gm) {
  switch (gm && gm.status) {
    case 'created':
      return `Created as an UNPAID member (id ${gm.memberId}). The signed agreement PDF is attached to their account. Mark them paid in Gym Manager once payment is received.`;
    case 'created_without_agreement':
      return `Created as an UNPAID member (id ${gm.memberId}), but the agreement PDF could not be attached automatically — please attach it manually from this email.`;
    case 'duplicate':
      return `An existing member already matches by ${gm.matchedOn} (id ${gm.memberId}) — no duplicate was created.`;
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

    // Validation
    if (!first_name || !last_name || !email || !phone || !membership_term || !membership_start_date || !copy_of_id || !signature || !date_of_signing) {
      return res.status(400).json({ error: 'Missing required fields' });
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

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    const mailOptions = {
      from: SMTP_USER || 'no-reply@fitpitznz.com',
      to: 'petergrant01@gmail.com',
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
ID Document: Attached as ID file (${copy_of_id.filename})

Gym Manager Account:
--------------------
${gymManagerSummary(gymManager)}

Best regards,
Fit Pit ZNZ Website
      `,
      attachments: []
    };

    // Attach Government ID
    if (copy_of_id && copy_of_id.base64) {
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

Our team is currently reviewing your photo ID and membership agreement form. We will contact you shortly to finalize your registration and payment.

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
      console.log('ID Attachment Name:', copy_of_id.filename);
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
