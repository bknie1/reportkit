---
title: Test Cards
kicker: Example
subtitle: Numbered test cards with a Pass and a Fail box
source: ReportKit
footer: ReportKit - Test Cards
---

## Test cards

Each card is one thing to test: who to test as, the story, what must be true, the steps, and what a pass and a fail look like.

:::testcard 1 Opening a changed item returns it
Test as :: Reviewer
Board :: 1234 Example item

**User story**

As a reviewer, when I open an item that has changed since it was submitted, I want it stopped before I rely on it.

**Acceptance criteria**

- The item is returned to its owner.
- The reason lists what changed.

**Test case**

https://example.com/items/42

1. Sign in and open the link.
2. Press View.
3. Go back to the list.

Pass: The item shows as returned and the reason lists what changed.
Fail: The item is unchanged, or the reason is missing.
:::

:::testcard 2 Refresh the panel
Test as :: Reviewer
Board :: 1235 Example item

**User story**

As a reviewer, I want to refresh a record on demand.

**Test case**

1. Open the record.
2. Press the refresh icon.

Pass: The panel updates without leaving the page.
Fail: The page navigates or an error appears.
:::
