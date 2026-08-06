# Debug Session: WA Unclaim Controls

Status: [OPEN]
Session ID: wa-unclaim-controls

## Symptoms

- The `Lepas claim` button cannot be clicked.
- Confirm/create-task controls remain visible after review state is released.

## Hypotheses

1. The unclaim endpoint fails or its response is not reflected by the hook.
2. The component hides only some controls instead of gating every decision control by `claimed` state.
3. Local busy state prevents the unclaim click handler from running.
4. Any state other than `claimed` incorrectly renders decision controls.

## Evidence Log

| Phase | Observation |
| --- | --- |
| Pre-fix | User reports both symptoms; runtime endpoint response not yet captured. |
| Post-fix | Pending user verification. |

## Decision Log

| Hypothesis | Status | Evidence |
| --- | --- | --- |
| 1 | Pending | |
| 2 | Confirmed by source | Decision controls were not fully gated by `claimed`. |
| 3 | Pending | |
| 4 | Confirmed by source | Confirm was disabled but still visible and reject remained visible in non-claimed states. |
