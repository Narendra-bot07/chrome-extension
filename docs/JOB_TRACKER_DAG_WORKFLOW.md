# Job Tracker - Directed Acyclic Graph (DAG) Workflow & 3D Auth Transition

This document defines the architectural specifications, UX constraints, and implementation details of the **Tailr4U Job Tracker DAG Pipeline** and the **Unified 3D Card Flip Auth Experience**.

---

## 1. Job Tracker DAG Workflow

Unlike traditional Kanban boards or arbitrary lineage graphs, the Tailr4U Job Tracker operates as a strict **Directed Acyclic Graph (DAG)**. Applications can only traverse forward through consecutive and terminal hiring stages.

### 1.1 Pipeline Stages & Ordinal Rank Indexes
The pipeline enforces ordinal ranks (`STAGE_ORDER`) to regulate transition flow:

| Rank | Stage ID | Display Label | Stage Type |
|---|---|---|---|
| **1** | `Ready To Apply` | Ready To Apply | Primary Stepper |
| **2** | `Applied` | Applied | Primary Stepper |
| **3** | `Assessment` | Assessment | Primary Stepper |
| **4** | `Recruiter` | Recruiter Contact | Primary Stepper |
| **5** | `Interview` | Interview | Primary Stepper |
| **6** | `Final Round` | Final Round | Primary Stepper |
| **7** | `Offer` | Offer Received | Primary Stepper |
| **8** | `Accepted` | Accepted 🎉 | Terminal Branch |
| **8** | `Rejected` | Rejected 🛑 | Terminal Branch |
| **8** | `Archived` | Archived 📁 | Terminal Branch |

### 1.2 Transition & Drag-and-Drop Rules
* **No Backward Movements**: Drops targeting previous or current rank positions (i.e. `targetOrder <= currentOrder`) are intercepted and blocked.
* **Terminal Isolation**: Once an application reaches a terminal stage (Rank `8` - `Accepted`, `Rejected`, `Archived`), no further transitions are allowed.
* **HTML5 Drag-and-Drop Intercepts**:
  - `handleDragOver`: Sets `e.dataTransfer.dropEffect = 'none'` when hovering over an invalid target stage.
  - `handleDrop`: Blocks the database update transaction and triggers a clean visual alert explaining the DAG constraint.

### 1.3 Visual Upstream Completion Markers
When an application moves downstream, all preceding stages are marked as completed:
* **Emerald Theme Conversion**: Preceding stage blocks transition their borders to `#10b981` (emerald green) with a soft background tint.
* **Visual Checklist Indicators**: The standard stage color dot is replaced with an emerald green checkmark icon.
* **Done Indicator Badges**: A clear `Done` tag is rendered in the top-right of completed stage headers to visually lock past milestones.

---

## 2. Unified 3D Auth Card Flip

To establish a premium, fluid SaaS landing experience, the **Login** and **Register** views share a unified workspace with hardware-accelerated transitions.

### 2.1 UI Split-Screen Showcase
* **Left Showcase Panel**: A static, modern, light-theme feature panel displaying steps of the Tailr4U core product journey (`Upload Master Resume` $\rightarrow$ `AI Tailoring Scan` $\rightarrow$ `Active Pipeline Board`).
* **Right Workspace Panel**: A perspective flip zone containing the 3D-card.

### 2.2 3D Card Flip Mechanism
* **Perspective Context**: The parent container sets `perspective: 1500px`.
* **Symmetrical Design Cards**: The card inner layer preserves 3D transforms (`transform-style: preserve-3d`) and houses:
  - **Front Face**: Login workspace form.
  - **Back Face**: Register workspace form (rotated by `rotateY(180deg)`).
* **Smooth Transitions**: Clicking toggle buttons updates the React Router path (`/login` or `/register`). This triggers a GPU-rendered `rotateY` card flip transition while leaving the left showcase panel and background static.
