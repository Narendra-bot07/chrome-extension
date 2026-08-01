# Tailr4U - Cloudflare R2 & Object Storage Specification

This document details the object storage architecture, S3-compatible Cloudflare R2 / Supabase Storage integrations, bucket security policies, and deterministic asset file-path mapping for **Tailr4U**.

---

## 1. Storage Architecture Overview

Tailr4U uses **Cloudflare R2** (or S3-compatible Supabase Storage) for storing unstructured binary blobs (candidate master resumes, AI-tailored rendered PDFs, template preview thumbnails, and profile avatars).

```mermaid
graph TD
    subgraph FastAPI Application Engine
        UPLOADER["Resume Upload Handler"]
        PLAYWRIGHT["Playwright PDF Engine"]
    end

    subgraph Object Storage Buckets (Cloudflare R2 / Supabase)
        ORIGINAL["original-resumes (Private Bucket)<br/>original-resumes/{user_id}/{filename}"]
        GENERATED["generated-resumes (Private Bucket)<br/>generated-resumes/{user_id}/{version_id}.pdf"]
        PREVIEWS["template-previews (Public Bucket)<br/>template-previews/{template_name}.png"]
        AVATARS["avatars (Public Bucket)<br/>avatars/{user_id}/avatar.{ext}"]
    end

    subgraph PostgreSQL Database
        DB[("public.resumes & public.resume_versions<br/>(Stores Object URI Paths)")]
    end

    UPLOADER -->|"Save Original Upload (PDF/DOCX)"| ORIGINAL
    PLAYWRIGHT -->|"Save Rendered PDF Vector"| GENERATED
    ORIGINAL -->|"Update file_path Column"| DB
    GENERATED -->|"Update rendered_pdf_path Column"| DB
```

---

## 2. Storage Buckets & Access Control Matrix

| Bucket Name | Visibility | Allowed Formats | Max File Size | Access Policy |
| :--- | :--- | :--- | :--- | :--- |
| `original-resumes` | **Private** | `PDF`, `DOCX`, `TXT` | `10 MB` | Restricted to authenticated owner (`auth.uid()`) |
| `generated-resumes` | **Private** | `PDF` | `15 MB` | Restricted to authenticated owner (`auth.uid()`) |
| `template-previews` | **Public** | `PNG`, `SVG`, `PDF` | `5 MB` | Public CDN GET access |
| `avatars` | **Public** | `JPG`, `PNG`, `WEBP` | `2 MB` | Public CDN GET access, owner-only write |

---

## 3. Presigned URLs & CDN Delivery Protocol

- **Private Objects**: Accessing original candidate uploads or generated PDFs requires a temporary **Presigned URL** generated via Supabase Storage S3 client with a 15-minute expiration (`expires_in = 900`).
- **Public Objects**: Template thumbnails and user avatars are cached globally via Cloudflare CDN edge locations (`Cache-Control: public, max-age=31536000, immutable`).
