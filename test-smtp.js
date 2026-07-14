require('dotenv').config();
const nodemailer = require('nodemailer');

async function testSmtp() {
  const registeredEmail = process.env.REGISTERED_EMAIL;
  const smtpPassword = process.env.SMTP_APP_PASSWORD;

  console.log(`Testing with email: ${registeredEmail}`);
  console.log(`Testing with password: ${smtpPassword ? '*'.repeat(smtpPassword.length) : 'MISSING'}`);

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: registeredEmail,
      pass: smtpPassword
    }
  });

  try {
    await transporter.verify();
    console.log("SUCCESS: SMTP configuration is valid and working!");
  } catch (error) {
    console.error("ERROR: SMTP connection failed!");
    console.error(error.message);
  }
}

testSmtp();
