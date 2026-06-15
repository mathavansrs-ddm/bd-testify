import os
from dotenv import load_dotenv

load_dotenv()


def _send_email(to_email: str, subject: str, html_body: str):
    api_key = os.getenv("SENDGRID_API_KEY", "")
    from_email = os.getenv("FROM_EMAIL", "bdtestifyinfo@gmail.com")
    from_name = os.getenv("FROM_NAME", "BD Testify")

    if not api_key:
        raise Exception("SENDGRID_API_KEY is not set in environment variables.")

    import urllib.request
    import urllib.error
    import json

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": subject,
        "content": [{"type": "text/html", "value": html_body}]
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status not in (200, 201, 202):
                raise Exception(f"SendGrid returned status {resp.status}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise Exception(f"SendGrid error {e.code}: {body}")


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
