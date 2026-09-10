# Fajia Feedback - Blob emergency backend

Upload these files to the ROOT of the existing `just0618/fajia` repository:

- `package.json` (new)
- `edge-functions/api/feedback.js` (replace old file)
- `edge-functions/api/feedback-admin.js` (replace old file)

No Blob SDK file, API token, project ID, or Blob namespace needs to be supplied manually.
EdgeOne Makers installs `@edgeone/pages-blob` from `package.json` during deployment.
The first request to the function automatically creates the Blob namespace `fajia-feedback`.

## Still required in EdgeOne

Create a production environment variable:

- Name: `FEEDBACK_ADMIN_TOKEN`
- Value: a private long random string chosen by the site owner

After adding/changing the environment variable, redeploy.

## Test after deployment

1. Open `/api/feedback`.
   Expected JSON contains: `"storage":"blob"`.
2. Open `/feedback/`, fill a test response, and submit.
3. Open `/feedback-admin/`, enter `FEEDBACK_ADMIN_TOKEN`, and load feedback.
4. In Makers -> Storage -> Blob Storage, a namespace named `fajia-feedback` should appear after the first API write/read request.

The form's local draft behavior does not change. No name, phone, email, IP address, or device fingerprint is intentionally stored by these functions.
