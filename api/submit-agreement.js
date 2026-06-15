import nodemailer from 'nodemailer';

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
      return res.status(200).json({ success: true, message: 'Agreement submitted and emails dispatched successfully.' });
    } else {
      console.warn('WARNING: SMTP Environment variables are not set. Logging agreement payload directly (Dry-Run Mode):');
      console.log('Agreement Fields:', { first_name, last_name, email, phone, membership_term, membership_start_date, date_of_signing });
      console.log('ID Attachment Name:', copy_of_id.filename);
      console.log('Signature Type:', signature.type);
      if (signature.type === 'type') console.log('Typed Signature Text:', signature.data);
      
      return res.status(200).json({
        success: true,
        message: 'Agreement received successfully (dry-run). To enable real email delivery, configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in your Vercel project settings.'
      });
    }
  } catch (error) {
    console.error('Error processing membership agreement:', error);
    return res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
}
