from app.schemas import ResumeStructure, CoverLetterResult

def escape_html(text: str) -> str:
    """Helper to escape common HTML characters to prevent breaking PDF tags."""
    if not text:
        return ""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#x27;")

def get_modern_html(resume: ResumeStructure) -> str:
    # Modern Left Sidebar Template.
    name = escape_html(resume.personal_info.name or "Your Name")
    email = escape_html(resume.personal_info.email)
    phone = escape_html(resume.personal_info.phone)
    location = escape_html(resume.personal_info.location)
    linkedin = escape_html(resume.personal_info.linkedin)
    website = escape_html(resume.personal_info.website)
    summary = escape_html(resume.summary)

    # Experience HTML
    experience_html = ""
    for exp in resume.experience:
        bullets = "".join([f"<li>{escape_html(b)}</li>" for b in exp.description if b.strip()])
        experience_html += f"""
        <div class="section-item">
            <table class="item-header-table" width="100%">
                <tr>
                    <td align="left"><strong>{escape_html(exp.role)}</strong> - <em>{escape_html(exp.company)}</em></td>
                    <td align="right" class="date-text">{escape_html(exp.start_date)} - {escape_html(exp.end_date)}</td>
                </tr>
            </table>
            <span class="location-text">{escape_html(exp.location)}</span>
            <ul class="bullet-list">{bullets}</ul>
        </div>
        """

    # Projects HTML
    projects_html = ""
    for proj in resume.projects:
        bullets = "".join([f"<li>{escape_html(b)}</li>" for b in proj.description if b.strip()])
        tech_stack = f" | Tech: {', '.join(proj.technology_stack)}" if proj.technology_stack else ""
        projects_html += f"""
        <div class="section-item">
            <table class="item-header-table" width="100%">
                <tr>
                    <td align="left"><strong>{escape_html(proj.name)}</strong> <span class="tech-text">{escape_html(tech_stack)}</span></td>
                    <td align="right" class="date-text">{escape_html(proj.role)}</td>
                </tr>
            </table>
            {f'<div class="link-text">{escape_html(proj.link)}</div>' if proj.link else ''}
            <ul class="bullet-list">{bullets}</ul>
        </div>
        """

    # Education HTML
    education_html = ""
    for edu in resume.education:
        gpa_str = f" (GPA: {escape_html(edu.gpa)})" if edu.gpa else ""
        education_html += f"""
        <div class="section-item">
            <table class="item-header-table" width="100%">
                <tr>
                    <td align="left"><strong>{escape_html(edu.degree)} in {escape_html(edu.field_of_study)}</strong></td>
                    <td align="right" class="date-text">{escape_html(edu.start_date)} - {escape_html(edu.end_date)}</td>
                </tr>
            </table>
            <span class="location-text">{escape_html(edu.institution)} - {escape_html(edu.location)}{gpa_str}</span>
        </div>
        """

    # Skills HTML
    skills_html = ""
    skills_categories = getattr(resume, "skills_categories", None)
    if skills_categories and isinstance(skills_categories, dict) and len(skills_categories) > 0:
        for category, items in skills_categories.items():
            if items:
                escaped_items = ", ".join([escape_html(item) for item in items if item.strip()])
                escaped_category = escape_html(category)
                skills_html += f"""
                <div style="margin-bottom: 6px; text-align: left;">
                    <strong style="font-size: 8.5pt; color: #2B6CB0; text-transform: uppercase; display: block;">{escaped_category}:</strong>
                    <span style="font-size: 8.5pt; color: #4A5568; display: block; margin-top: 1px;">{escaped_items}</span>
                </div>
                """
    else:
        skills_html = "".join([f'<span class="skill-tag">{escape_html(skill)}</span>' for skill in resume.skills if skill.strip()])

    # Certifications HTML
    certs_html = ""
    for cert in resume.certifications:
        issue = f" - Issued: {escape_html(cert.issue_date)}" if cert.issue_date else ""
        certs_html += f"""
        <div class="cert-item">
            <strong>{escape_html(cert.name)}</strong><br/>
            <span class="cert-details">{escape_html(cert.issuing_organization)}{issue}</span>
        </div>
        """

    html = f"""
    <html>
    <head>
        <style>
            @page {{
                size: letter;
                margin: 0.4in;
            }}
            body {{
                font-family: Helvetica, Arial, sans-serif;
                color: #2D3748;
                font-size: 9.5pt;
                line-height: 1.35;
            }}
            .header-bar {{
                border-bottom: 2px solid #3182CE;
                padding-bottom: 8px;
                margin-bottom: 15px;
            }}
            .candidate-name {{
                font-size: 24pt;
                font-weight: bold;
                color: #1A365D;
                margin-bottom: 2px;
            }}
            .main-layout {{
                width: 100%;
            }}
            .sidebar {{
                width: 28%;
                background-color: #F7FAFC;
                padding-right: 15px;
                vertical-align: top;
            }}
            .main-content {{
                width: 72%;
                padding-left: 15px;
                vertical-align: top;
            }}
            .section-title {{
                font-size: 12pt;
                font-weight: bold;
                color: #2B6CB0;
                border-bottom: 1px solid #E2E8F0;
                padding-bottom: 3px;
                margin-top: 15px;
                margin-bottom: 8px;
                text-transform: uppercase;
            }}
            .sidebar-title {{
                font-size: 10.5pt;
                font-weight: bold;
                color: #2B6CB0;
                border-bottom: 1px solid #CBD5E0;
                padding-bottom: 2px;
                margin-top: 12px;
                margin-bottom: 6px;
                text-transform: uppercase;
            }}
            .contact-info {{
                font-size: 8.5pt;
                margin-bottom: 4px;
                color: #4A5568;
            }}
            .contact-info a {{
                color: #3182CE;
                text-decoration: none;
            }}
            .skill-tag {{
                display: block;
                background-color: #EBF8FF;
                color: #2B6CB0;
                padding: 3px 6px;
                margin-bottom: 4px;
                border-left: 3px solid #3182CE;
                font-size: 8.5pt;
            }}
            .cert-item {{
                margin-bottom: 8px;
                font-size: 8.5pt;
            }}
            .cert-details {{
                color: #718096;
            }}
            .section-item {{
                margin-bottom: 10px;
            }}
            .item-header-table {{
                margin-bottom: 2px;
            }}
            .date-text {{
                color: #718096;
                font-size: 8.5pt;
            }}
            .location-text {{
                color: #4A5568;
                font-style: italic;
                font-size: 8.5pt;
            }}
            .tech-text {{
                color: #4A5568;
                font-size: 8.5pt;
                font-weight: normal;
            }}
            .link-text {{
                color: #3182CE;
                font-size: 8.5pt;
                margin-bottom: 2px;
            }}
            .bullet-list {{
                margin-top: 3px;
                margin-bottom: 0px;
                padding-left: 15px;
            }}
            .bullet-list li {{
                margin-bottom: 2px;
                font-size: 9pt;
            }}
        </style>
    </head>
    <body>
        <div class="header-bar">
            <table width="100%">
                <tr>
                    <td align="left">
                        <div class="candidate-name">{name}</div>
                    </td>
                </tr>
            </table>
        </div>
        
        <table class="main-layout" width="100%">
            <tr>
                <!-- LEFT SIDEBAR -->
                <td class="sidebar">
                    <div class="sidebar-title">Contact</div>
                    {f'<div class="contact-info">📞 {phone}</div>' if phone else ''}
                    {f'<div class="contact-info">✉️ {email}</div>' if email else ''}
                    {f'<div class="contact-info">📍 {location}</div>' if location else ''}
                    {f'<div class="contact-info">🔗 <a href="https://{linkedin}">{linkedin}</a></div>' if linkedin else ''}
                    {f'<div class="contact-info">🌐 <a href="https://{website}">{website}</a></div>' if website else ''}
                    
                    <div class="sidebar-title">Skills</div>
                    <div style="margin-top: 5px;">
                        {skills_html}
                    </div>
                    
                    {f'<div class="sidebar-title">Certifications</div>{certs_html}' if certs_html else ''}
                </td>
                
                <!-- RIGHT MAIN CONTENT -->
                <td class="main-content">
                    {f'<div class="section-title">Professional Summary</div><div style="font-size: 9pt; margin-bottom: 10px;">{summary}</div>' if summary else ''}
                    
                    {f'<div class="section-title">Work Experience</div>{experience_html}' if experience_html else ''}
                    
                    {f'<div class="section-title">Projects</div>{projects_html}' if projects_html else ''}
                    
                    {f'<div class="section-title">Education</div>{education_html}' if education_html else ''}
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    return html

def get_classic_html(resume: ResumeStructure) -> str:
    # Classic Centered Serif Template.
    name = escape_html(resume.personal_info.name or "Your Name")
    email = escape_html(resume.personal_info.email)
    phone = escape_html(resume.personal_info.phone)
    location = escape_html(resume.personal_info.location)
    linkedin = escape_html(resume.personal_info.linkedin)
    website = escape_html(resume.personal_info.website)
    summary = escape_html(resume.summary)

    # Contact header
    contact_parts = []
    if phone: contact_parts.append(phone)
    if email: contact_parts.append(email)
    if location: contact_parts.append(location)
    if linkedin: contact_parts.append(f'<a href="https://{linkedin}">LinkedIn</a>')
    if website: contact_parts.append(f'<a href="https://{website}">Website</a>')
    contact_header = " | ".join(contact_parts)

    # Experience HTML
    experience_html = ""
    for exp in resume.experience:
        bullets = "".join([f"<li>{escape_html(b)}</li>" for b in exp.description if b.strip()])
        experience_html += f"""
        <div class="section-item">
            <table class="item-header-table" width="100%">
                <tr>
                    <td align="left"><strong>{escape_html(exp.company)}</strong> — <em>{escape_html(exp.role)}</em></td>
                    <td align="right" class="date-text">{escape_html(exp.start_date)} – {escape_html(exp.end_date)}</td>
                </tr>
                <tr>
                    <td align="left" class="location-text">{escape_html(exp.location)}</td>
                    <td align="right"></td>
                </tr>
            </table>
            <ul class="bullet-list">{bullets}</ul>
        </div>
        """

    # Projects HTML
    projects_html = ""
    for proj in resume.projects:
        bullets = "".join([f"<li>{escape_html(b)}</li>" for b in proj.description if b.strip()])
        tech_stack = f" (Technologies: {', '.join(proj.technology_stack)})" if proj.technology_stack else ""
        link_str = f" | Link: {escape_html(proj.link)}" if proj.link else ""
        projects_html += f"""
        <div class="section-item">
            <table class="item-header-table" width="100%">
                <tr>
                    <td align="left"><strong>{escape_html(proj.name)}</strong>{escape_html(tech_stack)}</td>
                    <td align="right" class="date-text">{escape_html(proj.role)}</td>
                </tr>
            </table>
            {f'<div class="location-text">{link_str[3:]}</div>' if link_str else ''}
            <ul class="bullet-list">{bullets}</ul>
        </div>
        """

    # Education HTML
    education_html = ""
    for edu in resume.education:
        gpa_str = f" — GPA: {escape_html(edu.gpa)}" if edu.gpa else ""
        education_html += f"""
        <div class="section-item">
            <table class="item-header-table" width="100%">
                <tr>
                    <td align="left"><strong>{escape_html(edu.institution)}</strong></td>
                    <td align="right" class="date-text">{escape_html(edu.start_date)} – {escape_html(edu.end_date)}</td>
                </tr>
            </table>
            <div class="location-text">{escape_html(edu.degree)} in {escape_html(edu.field_of_study)} — {escape_html(edu.location)}{gpa_str}</div>
        </div>
        """

    # Skills HTML
    skills_html = ""
    skills_categories = getattr(resume, "skills_categories", None)
    if skills_categories and isinstance(skills_categories, dict) and len(skills_categories) > 0:
        html_lines = []
        for category, items in skills_categories.items():
            if items:
                escaped_items = ", ".join([escape_html(item) for item in items if item.strip()])
                escaped_category = escape_html(category)
                html_lines.append(f'<div><strong>{escaped_category}:</strong> {escaped_items}</div>')
        skills_html = f'<div class="section-item" style="line-height: 1.5; text-align: left;">{"".join(html_lines)}</div>'
    elif resume.skills:
        skills_list = ", ".join(resume.skills)
        skills_html = f'<div class="section-item"><strong>Skills:</strong> {escape_html(skills_list)}</div>'

    # Certifications HTML
    certs_list = []
    for cert in resume.certifications:
        issue = f" ({escape_html(cert.issue_date)})" if cert.issue_date else ""
        certs_list.append(f"{escape_html(cert.name)} by {escape_html(cert.issuing_organization)}{issue}")
    certs_html = f'<div class="section-item"><strong>Certifications:</strong> {"; ".join(certs_list)}</div>' if certs_list else ""

    html = f"""
    <html>
    <head>
        <style>
            @page {{
                size: letter;
                margin: 0.5in;
            }}
            body {{
                font-family: "Times New Roman", Times, Georgia, serif;
                color: #111111;
                font-size: 10pt;
                line-height: 1.4;
            }}
            .candidate-name {{
                font-size: 22pt;
                font-weight: bold;
                text-align: center;
                margin-bottom: 2px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }}
            .contact-header {{
                text-align: center;
                font-size: 9pt;
                color: #444444;
                margin-bottom: 15px;
            }}
            .contact-header a {{
                color: #111111;
                text-decoration: none;
            }}
            .section-title {{
                font-size: 11pt;
                font-weight: bold;
                border-bottom: 1.5px solid #111111;
                padding-bottom: 2px;
                margin-top: 15px;
                margin-bottom: 6px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }}
            .section-item {{
                margin-bottom: 8px;
            }}
            .item-header-table {{
                margin-bottom: 1px;
            }}
            .date-text {{
                font-style: italic;
            }}
            .location-text {{
                font-style: italic;
                color: #555555;
                font-size: 9pt;
            }}
            .bullet-list {{
                margin-top: 3px;
                margin-bottom: 0px;
                padding-left: 20px;
            }}
            .bullet-list li {{
                margin-bottom: 2px;
            }}
        </style>
    </head>
    <body>
        <div class="candidate-name">{name}</div>
        <div class="contact-header">{contact_header}</div>
        
        {f'<div class="section-title">Professional Summary</div><div style="margin-bottom: 10px;">{summary}</div>' if summary else ''}
        
        {f'<div class="section-title">Experience</div>{experience_html}' if experience_html else ''}
        
        {f'<div class="section-title">Projects</div>{projects_html}' if projects_html else ''}
        
        {f'<div class="section-title">Education</div>{education_html}' if education_html else ''}
        
        {f'<div class="section-title">Skills &amp; Certifications</div>{skills_html}{certs_html}' if (skills_html or certs_html) else ''}
    </body>
    </html>
    """
    return html

def get_minimal_html(resume: ResumeStructure) -> str:
    # Tech Minimal Single-Column Template.
    name = escape_html(resume.personal_info.name or "Your Name")
    email = escape_html(resume.personal_info.email)
    phone = escape_html(resume.personal_info.phone)
    location = escape_html(resume.personal_info.location)
    linkedin = escape_html(resume.personal_info.linkedin)
    website = escape_html(resume.personal_info.website)
    summary = escape_html(resume.summary)

    # Contact details
    contact_parts = []
    if email: contact_parts.append(f"Email: {email}")
    if phone: contact_parts.append(f"Phone: {phone}")
    if location: contact_parts.append(f"Loc: {location}")
    if linkedin: contact_parts.append(f"LinkedIn: {linkedin}")
    if website: contact_parts.append(f"Web: {website}")
    contact_text = "  |  ".join(contact_parts)

    # Experience HTML
    experience_html = ""
    for exp in resume.experience:
        bullets = "".join([f"<li>{escape_html(b)}</li>" for b in exp.description if b.strip()])
        experience_html += f"""
        <div class="section-item">
            <table class="item-header-table" width="100%">
                <tr>
                    <td align="left"><span class="title-bold">{escape_html(exp.role)}</span> — {escape_html(exp.company)}</td>
                    <td align="right" class="meta-text">{escape_html(exp.start_date)} - {escape_html(exp.end_date)}</td>
                </tr>
            </table>
            <div class="meta-text" style="font-style: italic;">{escape_html(exp.location)}</div>
            <ul class="bullet-list">{bullets}</ul>
        </div>
        """

    # Projects HTML
    projects_html = ""
    for proj in resume.projects:
        bullets = "".join([f"<li>{escape_html(b)}</li>" for b in proj.description if b.strip()])
        tech_text = f" | [{', '.join(proj.technology_stack)}]" if proj.technology_stack else ""
        projects_html += f"""
        <div class="section-item">
            <table class="item-header-table" width="100%">
                <tr>
                    <td align="left"><span class="title-bold">{escape_html(proj.name)}</span>{escape_html(tech_text)}</td>
                    <td align="right" class="meta-text">{escape_html(proj.role)}</td>
                </tr>
            </table>
            {f'<div class="meta-text">{escape_html(proj.link)}</div>' if proj.link else ''}
            <ul class="bullet-list">{bullets}</ul>
        </div>
        """

    # Education HTML
    education_html = ""
    for edu in resume.education:
        gpa_str = f", GPA: {escape_html(edu.gpa)}" if edu.gpa else ""
        education_html += f"""
        <div class="section-item">
            <table class="item-header-table" width="100%">
                <tr>
                    <td align="left"><span class="title-bold">{escape_html(edu.degree)}</span> in {escape_html(edu.field_of_study)}</td>
                    <td align="right" class="meta-text">{escape_html(edu.start_date)} - {escape_html(edu.end_date)}</td>
                </tr>
            </table>
            <div class="meta-text">{escape_html(edu.institution)} ({escape_html(edu.location)}){gpa_str}</div>
        </div>
        """

    # Skills HTML
    skills_html = ""
    skills_categories = getattr(resume, "skills_categories", None)
    if skills_categories and isinstance(skills_categories, dict) and len(skills_categories) > 0:
        html_lines = []
        for category, items in skills_categories.items():
            if items:
                escaped_items = ", ".join([escape_html(item) for item in items if item.strip()])
                escaped_category = escape_html(category)
                html_lines.append(f'<div><strong>{escaped_category}:</strong> {escaped_items}</div>')
        skills_html = f"""
        <div class="section-item">
            <table width="100%">
                <tr>
                    <td width="15%" valign="top"><span class="title-bold">Skills</span></td>
                    <td width="85%" valign="top" style="line-height: 1.5; text-align: left;">{"".join(html_lines)}</td>
                </tr>
            </table>
        </div>
        """
    elif resume.skills:
        skills_html = f"""
        <div class="section-item">
            <table width="100%">
                <tr>
                    <td width="15%" valign="top"><span class="title-bold">Skills</span></td>
                    <td width="85%" valign="top">{escape_html(', '.join(resume.skills))}</td>
                </tr>
            </table>
        </div>
        """

    # Certifications HTML
    certs_html = ""
    if resume.certifications:
        certs_list = []
        for c in resume.certifications:
            d = f" ({escape_html(c.issue_date)})" if c.issue_date else ""
            certs_list.append(f"{escape_html(c.name)} ({escape_html(c.issuing_organization)}{d})")
        certs_html = f"""
        <div class="section-item">
            <table width="100%">
                <tr>
                    <td width="15%" valign="top"><span class="title-bold">Certs</span></td>
                    <td width="85%" valign="top">{escape_html(', '.join(certs_list))}</td>
                </tr>
            </table>
        </div>
        """

    html = f"""
    <html>
    <head>
        <style>
            @page {{
                size: letter;
                margin: 0.45in;
            }}
            body {{
                font-family: "Courier New", Courier, monospace, Arial, sans-serif;
                color: #222222;
                font-size: 9pt;
                line-height: 1.3;
            }}
            .candidate-name {{
                font-size: 20pt;
                font-weight: bold;
                margin-bottom: 2px;
                color: #000000;
            }}
            .contact-line {{
                font-size: 8pt;
                color: #555555;
                margin-bottom: 12px;
                border-bottom: 1px solid #cccccc;
                padding-bottom: 6px;
            }}
            .section-title {{
                font-size: 10pt;
                font-weight: bold;
                color: #000000;
                margin-top: 12px;
                margin-bottom: 6px;
                text-transform: uppercase;
                border-bottom: 1px dashed #aaaaaa;
                padding-bottom: 1px;
            }}
            .section-item {{
                margin-bottom: 8px;
            }}
            .title-bold {{
                font-weight: bold;
            }}
            .meta-text {{
                color: #666666;
                font-size: 8pt;
            }}
            .bullet-list {{
                margin-top: 2px;
                margin-bottom: 0px;
                padding-left: 15px;
            }}
            .bullet-list li {{
                margin-bottom: 1px;
                font-family: Arial, sans-serif; /* Use sans-serif for description text readability */
                font-size: 8.5pt;
            }}
        </style>
    </head>
    <body>
        <div class="candidate-name">{name}</div>
        <div class="contact-line">{contact_text}</div>
        
        {f'<div class="section-title">Summary</div><div style="margin-bottom: 8px; font-family: Arial, sans-serif; font-size: 8.5pt;">{summary}</div>' if summary else ''}
        
        {f'<div class="section-title">Experience</div>{experience_html}' if experience_html else ''}
        
        {f'<div class="section-title">Projects</div>{projects_html}' if projects_html else ''}
        
        {f'<div class="section-title">Education</div>{education_html}' if education_html else ''}
        
        {f'<div class="section-title">Skills &amp; Credentials</div>{skills_html}{certs_html}' if (skills_html or certs_html) else ''}
    </body>
    </html>
    """
    return html

def get_cover_letter_html(letter: CoverLetterResult) -> str:
    """Generate professional HTML code for the cover letter fallback compilation."""
    recipient = escape_html(letter.recipient_name)
    company = escape_html(letter.company_name)
    date = escape_html(letter.date)
    salutation = escape_html(letter.salutation)
    body_html = "".join([f"<p>{escape_html(p)}</p>" for p in letter.body.split("\n\n")])
    signoff_html = escape_html(letter.signoff).replace("\n", "<br/>")
    
    html = f"""
    <html>
    <head>
        <style>
            @page {{
                size: letter;
                margin: 1.0in;
            }}
            body {{
                font-family: Georgia, serif;
                font-size: 11pt;
                line-height: 1.5;
                color: #111111;
            }}
            .date {{
                margin-bottom: 15px;
            }}
            .recipient {{
                margin-bottom: 20px;
            }}
            .body-text {{
                margin-bottom: 25px;
                text-align: justify;
            }}
            .signoff {{
                margin-top: 20px;
            }}
        </style>
    </head>
    <body>
        <div class="date"><strong>Date:</strong> {date}</div>
        <div class="recipient">
            <strong>To:</strong><br/>
            {recipient}<br/>
            {company}
        </div>
        <div style="margin-bottom: 15px;">{salutation}</div>
        <div class="body-text">{body_html}</div>
        <div class="signoff">{signoff_html}</div>
    </body>
    </html>
    """
    return html
