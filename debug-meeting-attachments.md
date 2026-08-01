# Debug Meeting Attachments

Status: [RESOLVED]

## Symptoms

- Meeting can be opened.
- Uploaded attachments are not visible or openable from meeting detail.

## Hypotheses

1. Meeting detail API does not return attachment records.
2. Meeting detail UI has no attachment section or open action.
3. Attachment records store extracted text but no original file storage path.
4. No tenant-safe download endpoint exists for meeting attachments.

## Evidence

Investigation started from the reported UI behavior. No business logic changes have been made yet.

## Root Cause

- Upload stored extracted text in `meeting_attachments` but did not store the original file in Supabase Storage.
- Meeting detail did not query or render attachments.
- No tenant-safe signed download endpoint existed.

## Fix

- Store uploaded files in the configured Supabase Storage bucket with tenant/meeting-scoped paths.
- Store storage path, size, and SHA-256 checksum in attachment metadata.
- Add attachment listing and signed download endpoints.
- Render attachment links in the meeting detail dialog.
