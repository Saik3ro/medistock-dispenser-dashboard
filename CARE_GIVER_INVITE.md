Caregiver Invitation feature — setup

1) EmailJS
- Sign up at https://www.emailjs.com/ and create a service + email template.
- Template variables used: `patient_name`, `invite_link`, `expiry_date`.
- Copy your Service ID, Template ID, and Public Key.

2) Environment variables
Add the following to your `.env` (project root) — Vite requires `VITE_` prefix:

VITE_EMAILJS_SERVICE_ID=service_xxx
VITE_EMAILJS_TEMPLATE_ID=template_xxx
VITE_EMAILJS_PUBLIC_KEY=user_xxx

3) Patient id for local testing
- The components try to resolve the current patient id from, in order:
  - `patientId` prop passed to the component
  - `localStorage.patient_id` or `localStorage.uid`
  - `VITE_PATIENT_ID` env var

Set one for local testing, e.g.:
VITE_PATIENT_ID=test_patient_123

4) How it works
- `CaregiverInvite` component writes invitations to `/invitations` (Realtime DB) with fields: `email`, `patient_id`, `patient_name`, `token`, `status`, `created_at`, `expires_at`.
- `AcceptInvitation` route (`/accept-invitation?token=...`) scans `/invitations` for the token and, if the visitor is authenticated (localStorage.uid used as a fallback), writes the caregiver record under `/caregivers/{caregiver_uid}` and updates the invitation status.

5) Testing
- Start dev server:
```bash
npm install
npm run dev
```
- Set `localStorage.patient_id` and `localStorage.uid` in the browser console for quick testing:
```js
localStorage.setItem('patient_id','test_patient_123')
localStorage.setItem('uid','patient_user_123')
```

6) Notes
- The provided Realtime Database rules are a starting point; review and tighten before production.
