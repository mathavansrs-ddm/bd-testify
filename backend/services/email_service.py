import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

load_dotenv()

def _send_email(to_email: str, subject: str, html_body: str):
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_name = os.getenv("FROM_NAME", "BD Testify")

    if not smtp_user or not smtp_password:
        raise Exception("SMTP credentials not configured. Set SMTP_USER and SMTP_PASSWORD in Railway Variables.")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{smtp_user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, to_email, msg.as_string())


def send_invite_email(to_email: str, candidate_name: str, test_link: str, expires_in: str = "24 hours"):
    subject = "Your Building Doctor Assessment Invitation"
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {{ font-family: Arial, sans-serif; background: #f4f6f8; margin: 0; padding: 0; }}
        .container {{ max-width: 600px; margin: 30px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
        .header {{ background: #1e3a5f; color: #fff; padding: 30px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 24px; }}
        .body {{ padding: 30px; color: #333; }}
        .btn {{ display: inline-block; margin: 20px 0; padding: 14px 28px; background: #1e3a5f; color: #fff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; }}
        .footer {{ background: #f4f6f8; padding: 20px; text-align: center; font-size: 12px; color: #888; }}
        .warning {{ background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 16px 0; border-radius: 4px; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>BD Testify — Building Doctor</h1>
          <p>Online Assessment Platform</p>
        </div>
        <div class="body">
          <p>Dear <strong>{candidate_name}</strong>,</p>
          <p>You have been invited to take the Building Doctor online assessment. Please click the button below to begin your registration and start the test.</p>
          <div class="warning">
            <strong>⏳ This link expires in {expires_in}.</strong> Please complete your test before the link expires.
          </div>
          <p><strong>Instructions:</strong></p>
          <ul>
            <li>Ensure you have a working webcam and microphone</li>
            <li>Use a stable internet connection</li>
            <li>Do not switch tabs or minimize the browser during the test</li>
            <li>Keep your face visible to the webcam throughout the test</li>
            <li>The test must be completed in one sitting</li>
          </ul>
          <center>
            <a href="{test_link}" class="btn">Start My Assessment →</a>
          </center>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #1e3a5f;">{test_link}</p>
        </div>
        <div class="footer">
          <p>© 2025 Building Doctor. All rights reserved.</p>
          <p>If you did not request this, please ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
    """
    _send_email(to_email, subject, html_body)


def send_result_email(to_email: str, candidate_name: str, score: int, total: int, percentage: float, test_set_name: str):
    subject = "Your Assessment Result — Building Doctor"
    pass_fail = "PASS" if percentage >= 60 else "FAIL"
    color = "#28a745" if percentage >= 60 else "#dc3545"
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {{ font-family: Arial, sans-serif; background: #f4f6f8; margin: 0; padding: 0; }}
        .container {{ max-width: 600px; margin: 30px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
        .header {{ background: #1e3a5f; color: #fff; padding: 30px; text-align: center; }}
        .scorecard {{ background: #f8f9fa; margin: 20px; border-radius: 8px; padding: 24px; text-align: center; }}
        .score-big {{ font-size: 48px; font-weight: bold; color: {color}; }}
        .body {{ padding: 30px; color: #333; }}
        .footer {{ background: #f4f6f8; padding: 20px; text-align: center; font-size: 12px; color: #888; }}
        .badge {{ display: inline-block; padding: 8px 20px; border-radius: 20px; background: {color}; color: #fff; font-weight: bold; font-size: 18px; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>BD Testify — Building Doctor</h1>
          <p>Assessment Result</p>
        </div>
        <div class="body">
          <p>Dear <strong>{candidate_name}</strong>,</p>
          <p>Thank you for completing the <strong>{test_set_name}</strong> assessment. Here are your results:</p>
        </div>
        <div class="scorecard">
          <div class="score-big">{score}/{total}</div>
          <p style="font-size: 20px; color: #555;">{percentage:.1f}%</p>
          <div class="badge">{pass_fail}</div>
        </div>
        <div class="body">
          <p>{'Congratulations! You have successfully passed the assessment.' if percentage >= 60 else 'Unfortunately, you did not pass this assessment. Please contact the administrator for further information.'}</p>
          <p>We appreciate your time and effort. The Building Doctor team will be in touch if there are further steps.</p>
          <p>Warm regards,<br><strong>Building Doctor Assessment Team</strong></p>
        </div>
        <div class="footer">
          <p>© 2025 Building Doctor. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
    """
    _send_email(to_email, subject, html_body)


# Celery task wrapper (optional, for bulk sending)
try:
    from celery import Celery
    import os

    celery_app = Celery(
        "email_tasks",
        broker=os.getenv("REDIS_URL", "redis://localhost:6379"),
        backend=os.getenv("REDIS_URL", "redis://localhost:6379"),
    )

    @celery_app.task
    def send_invite_email_task(to_email, candidate_name, test_link, expires_in="24 hours"):
        send_invite_email(to_email, candidate_name, test_link, expires_in)

    @celery_app.task
    def send_result_email_task(to_email, candidate_name, score, total, percentage, test_set_name):
        send_result_email(to_email, candidate_name, score, total, percentage, test_set_name)

except ImportError:
    pass
