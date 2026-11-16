---
title: Project Status
kicker: Spring release
subtitle: The plan and the enrollment numbers on one page
---

## Schedule

A chart block holds its own data as CSV, so the report stays one self-contained file. The option lines name the columns; the group sets the color and the percent column fills each bar.

:::chart gantt Release plan
task: Task
start: Start
end: End
group: Phase
progress: Percent done

Task,Phase,Start,End,Percent done
Gather requirements,Discovery,2026-11-02,2026-11-20,100
Review current process,Discovery,2026-11-09,2026-11-27,100
Design data model,Design,2026-11-23,2026-12-18,80
Design screens,Design,2026-12-07,2027-01-15,45
Build import,Build,2027-01-11,2027-02-26,20
Build reports,Build,2027-02-08,2027-03-26,0
User testing,Test,2027-03-15,2027-04-16,0
Go live,Launch,2027-05-10,,
:::

## Enrollment

:::chart bar Applied, admitted and enrolled by term
x: Term
y: Applied, Admitted, Enrolled

Term,Applied,Admitted,Enrolled
Fall 2023,4210,2630,1480
Fall 2024,4685,2790,1555
Fall 2025,5120,2955,1610
Fall 2026,5540,3105,1725
:::

> [!note] Reading the chart
> A task with no end date is drawn as a milestone. The line marks today when it falls inside the plan.
