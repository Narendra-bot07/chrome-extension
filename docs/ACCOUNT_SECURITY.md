# tailr4u account security

Run `migrate_account_security.py` once per environment, then configure the SMTP
values in `.env.example`. Use an external SMTP relay; do not run a local mail
server as part of the API.

Production must use a public HTTPS `FRONTEND_URL`, a long random `JWT_SECRET`,
and secret-managed SMTP credentials. Never expose SMTP values to the frontend.

Forgot-password responses are deliberately neutral. Reset and verification
tokens are single-use, time-limited, and stored only as SHA-256 digests.
