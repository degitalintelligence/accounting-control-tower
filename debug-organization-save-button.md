# Debug Session: Organization Save Button

Status: [OPEN]
Session: organization-save-button

## Symptom

The organization settings form does not save when clicking the "Simpan perubahan" button.

## Hypotheses

1. The button is disabled or the form submit handler is not invoked.
2. The organization update request returns an authorization or validation error.
3. The request targets the wrong organization context or endpoint.
4. The server mutation succeeds but the UI does not refresh or reports failure incorrectly.
5. The database migration or schema does not match the organization update payload.

## Evidence

- The browser accessibility snapshot showed the button, but clicking it did not create a `PATCH /api/settings/organization` request.
- DOM inspection showed the settings form and the save button, while the rendered button had `type="button"`.
- The form relies on `onSubmit={save}`, so a button with `type="button"` cannot invoke the save handler.

## Finding

Hypothesis 1 confirmed: the Base UI button rendered as a non-submit button because the form action did not explicitly pass `type="submit"`.

## Fix

Set the organization settings button to `type="submit"`.
