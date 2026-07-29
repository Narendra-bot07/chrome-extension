from app.schemas import ResumeStructure, CoverLetterResult

def escape_latex(text: str) -> str:
    """Escape special LaTeX control characters to prevent parser errors."""
    if not text:
        return ""
    replacements = {
        "\\": "\\textbackslash{}",
        "&": "\\&",
        "%": "\\%",
        "$": "\\$",
        "#": "\\#",
        "_": "\\_",
        "{": "\\{",
        "}": "\\}",
        "~": "\\textasciitilde{}",
        "^": "\\textasciicircum{}",
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text

def generate_latex_code(resume: ResumeStructure, template_name: str = "modern") -> str:
    """Generate clean, ATS-compliant LaTeX markup code representing the resume based on the chosen design template."""
    name = escape_latex(resume.personal_info.name or "Your Name")
    email = escape_latex(resume.personal_info.email)
    phone = escape_latex(resume.personal_info.phone)
    location = escape_latex(resume.personal_info.location)
    linkedin = escape_latex(resume.personal_info.linkedin)
    website = escape_latex(resume.personal_info.website)
    github = escape_latex(resume.personal_info.github)
    job_title = escape_latex(resume.personal_info.job_title or getattr(resume.personal_info, "title", ""))
    summary = escape_latex(resume.summary)

    contact_parts = []
    if phone: contact_parts.append(phone)
    if email: contact_parts.append(f"\\href{{mailto:{email}}}{{{email}}}")
    if linkedin: contact_parts.append(f"\\href{{https://{linkedin}}}{{LinkedIn}}")
    if github: contact_parts.append(f"\\href{{https://{github}}}{{GitHub}}")
    if website: contact_parts.append(f"\\href{{https://{website}}}{{Website}}")
    if location: contact_parts.append(location)

    # Set margins and fonts based on layout templates
    margin = "0.5in"
    font_pkg = "\\usepackage{times}"
    additional_header = ""
    section_rule = "[\\titlerule]"

    if template_name == "minimal":
        margin = "0.6in"
        font_pkg = "\\usepackage[ttdefault=true]{dejavu-mono}"
        section_rule = ""
    elif template_name == "modern":
        margin = "0.5in"
        font_pkg = "\\usepackage[sfdefault]{FiraSans}"
    elif template_name == "executive":
        margin = "0.45in"
        font_pkg = "\\usepackage{charter}"
    elif template_name == "academic":
        margin = "0.4in"
        font_pkg = "\\usepackage{lmodern}"
    elif template_name == "elegant":
        margin = "0.5in"
        font_pkg = "\\usepackage{times}"
        additional_header = "\\usepackage{color}"
    elif template_name == "startup":
        margin = "0.45in"
        font_pkg = "\\usepackage[sfdefault]{FiraSans}"

    job_title_line = f"{{\\large \\textit{{{job_title}}}}} \\\\\n  \\vspace{{2pt}}\n" if job_title else ""

    latex = f"""\\documentclass[letterpaper,10pt]{{article}}
\\usepackage[utf8]{{inputenc}}
\\usepackage{{geometry}}
\\geometry{{letterpaper, margin={margin}}}
\\usepackage{{titlesec}}
\\usepackage{{enumitem}}
\\usepackage{{hyperref}}
{font_pkg}
{additional_header}

\\hypersetup{{
    colorlinks=true,
    linkcolor=blue,
    filecolor=magenta,      
    urlcolor=blue,
}}

\\titleformat{{\\section}}{{\\large\\bfseries\\scshape}}{{}}{{0em}}{{}}{section_rule}
\\titlespacing{{\\section}}{{0pt}}{{6pt}}{{4pt}}

\\newcommand{{\\resumeItem}}[1]{{
  \\item\\small{{#1}}
}}

\\begin{{document}}
\\pagestyle{{empty}}

%--- HEADER ---
\\begin{{center}}
  {{\\Huge \\textbf{{{name}}}}} \\\\
  \\vspace{{4pt}}
  {job_title_line}  \\small{{" $|$ ".join(contact_parts)}}
\\end{{center}}
"""

    if summary:
        latex += f"""
%--- SUMMARY ---
\\section{{Summary}}
\\small{{{summary}}}
"""

    if resume.education:
        latex += """
%--- EDUCATION ---
\\section{Education}
\\begin{itemize}[leftmargin=0.15in, label={}]
"""
        for edu in resume.education:
            degree = escape_latex(edu.degree)
            field = escape_latex(edu.field_of_study)
            inst = escape_latex(edu.institution)
            eloc = escape_latex(edu.location)
            dates = escape_latex(f"{edu.start_date} - {edu.end_date}")
            gpa = f" (GPA: {escape_latex(edu.gpa)})" if edu.gpa else ""
            
            latex += f"""  \\item
    \\begin{{tabular*}}{{0.97\\textwidth}}[t]{{l@{{\\extracolsep{{\\fill}}}}r}}
      \\textbf{{{inst}}} -- {eloc} & \\small{{{dates}}} \\\\
      \\textit{{\\small{{{degree}}} in {field}}}{gpa} & \\\\
    \\end{{tabular*}}\\\\
"""
        latex += "\\end{itemize}\n"

    if resume.experience:
        latex += """
%--- EXPERIENCE ---
\\section{Experience}
\\begin{itemize}[leftmargin=0.15in, label={}]
"""
        for exp in resume.experience:
            role = escape_latex(exp.role)
            comp = escape_latex(exp.company)
            loc = escape_latex(exp.location)
            dates = escape_latex(f"{exp.start_date} - {exp.end_date}")
            
            latex += f"""  \\item
    \\begin{{tabular*}}{{0.97\\textwidth}}[t]{{l@{{\\extracolsep{{\\fill}}}}r}}
      \\textbf{{{role}}} -- {comp} & \\small{{{dates}}} \\\\
      \\textit{{\\small{{{loc}}}}} & \\\\
    \\end{{tabular*}}\\\\
    \\vspace{{-4pt}}
    \\begin{{itemize}}[leftmargin=0.10in]
"""
            for bullet in exp.description:
                if bullet.strip():
                    latex += f"      \\resumeItem{{{escape_latex(bullet)}}}\n"
            latex += "    \\end{itemize}\n"
        latex += "\\end{itemize}\n"

    # Check if we have skills_categories
    skills_categories = getattr(resume, "skills_categories", None)
    if skills_categories and isinstance(skills_categories, dict) and len(skills_categories) > 0:
        latex += """
%--- SKILLS ---
\\section{Technical Skills}
\\begin{itemize}[leftmargin=0.15in, label={}]
  \\item \\small{
"""
        skills_lines = []
        for category, items in skills_categories.items():
            if items:
                escaped_items = escape_latex(", ".join(items))
                escaped_category = escape_latex(category)
                skills_lines.append(f"\\textbf{{{escaped_category}}}: {escaped_items}")
        latex += " \\\\\n    ".join(skills_lines)
        latex += """
  }
\\end{itemize}
"""
    elif resume.skills:
        skills_escaped = escape_latex(", ".join(resume.skills))
        latex += f"""
%--- SKILLS ---
\\section{{Technical Skills}}
\\small{{\\textbf{{Skills: }} {skills_escaped}}}
"""

    if resume.projects:
        latex += """
%--- PROJECTS ---
\\section{Projects}
\\begin{itemize}[leftmargin=0.15in, label={}]
"""
        for proj in resume.projects:
            pname = escape_latex(proj.name)
            prole = escape_latex(proj.role)
            plink = escape_latex(proj.link)
            tech = escape_latex(", ".join(proj.technology_stack)) if proj.technology_stack else ""
            tech_str = f" ({tech})" if tech else ""
            link_str = f" $|$ \\href{{https://{proj.link}}}{{Link}}" if proj.link else ""
            
            latex += f"""  \\item
    \\begin{{tabular*}}{{0.97\\textwidth}}[t]{{l@{{\\extracolsep{{\\fill}}}}r}}
      \\textbf{{{pname}}}{tech_str} & \\small{{{prole}}}{link_str} \\\\
    \\end{{tabular*}}\\\\
    \\vspace{{-4pt}}
    \\begin{{itemize}}[leftmargin=0.10in]
"""
            for bullet in proj.description:
                if bullet.strip():
                    latex += f"      \\resumeItem{{{escape_latex(bullet)}}}\n"
            latex += "    \\end{itemize}\n"
        latex += "\\end{itemize}\n"



    if resume.certifications:
        certs_list = []
        for cert in resume.certifications:
            cname = escape_latex(cert.name)
            certs_list.append(cname)
        certs_str = " $|$ ".join(certs_list)
        
        latex += f"""
%--- CERTIFICATIONS ---
\\section{{Certifications}}
\\small{{{certs_str}}}
"""

    if resume.achievements:
        latex += """
%--- ACHIEVEMENTS & AWARDS ---
\\section{Achievements / Awards}
\\begin{itemize}[leftmargin=0.15in]
"""
        for ach in resume.achievements:
            if ach.strip():
                latex += f"  \\item \\small{{{escape_latex(ach)}}}\n"
        if resume.awards:
            for award in resume.awards:
                aw_title = escape_latex(award.get("title", ""))
                aw_issuer = escape_latex(award.get("issuer", ""))
                aw_date = escape_latex(award.get("date", ""))
                issuer_str = f" -- {aw_issuer}" if aw_issuer else ""
                date_str = f" ({aw_date})" if aw_date else ""
                latex += f"  \\item \\small{{\\textbf{{{aw_title}}}{issuer_str}{date_str}}}\n"
        latex += "\\end{itemize}\n"

    if resume.volunteer_experience:
        latex += """
%--- VOLUNTEER EXPERIENCE ---
\\section{Leadership / Volunteering}
\\begin{itemize}[leftmargin=0.15in, label={}]
"""
        for vol in resume.volunteer_experience:
            role = escape_latex(vol.get("role", ""))
            org = escape_latex(vol.get("organization", ""))
            dates = escape_latex(f"{vol.get('start_date', '')} - {vol.get('end_date', 'Present')}")
            latex += f"""  \\item
    \\begin{{tabular*}}{{0.97\\textwidth}}[t]{{l@{{\\extracolsep{{\\fill}}}}r}}
      \\textbf{{{role}}} -- {org} & \\small{{{dates}}} \\\\
    \\end{{tabular*}}\\\\
"""
            vol_desc = vol.get("description", [])
            if vol_desc:
                latex += "    \\vspace{-4pt}\n    \\begin{itemize}[leftmargin=0.10in]\n"
                for bullet in vol_desc:
                    if bullet.strip():
                        latex += f"      \\resumeItem{{{escape_latex(bullet)}}}\n"
                latex += "    \\end{itemize}\n"
        latex += "\\end{itemize}\n"

    if resume.publications:
        latex += """
%--- PUBLICATIONS ---
\\section{Publications / Research}
\\begin{itemize}[leftmargin=0.15in, label={}]
"""
        for pub in resume.publications:
            title = escape_latex(pub.get("title", ""))
            publisher = escape_latex(pub.get("publisher", ""))
            date = escape_latex(pub.get("date", ""))
            link = escape_latex(pub.get("link", ""))
            link_str = f" $|$ \\href{{https://{link}}}{{Link}}" if link else ""
            pub_str = f" -- {publisher}" if publisher else ""
            
            latex += f"""  \\item
    \\begin{{tabular*}}{{0.97\\textwidth}}[t]{{l@{{\\extracolsep{{\\fill}}}}r}}
      \\textbf{{{title}}}{link_str}{pub_str} & \\small{{{date}}} \\\\
    \\end{{tabular*}}\\\\
"""
        latex += "\\end{itemize}\n"

    if resume.languages:
        latex += """
%--- LANGUAGES ---
\\section{Languages}
\\begin{itemize}[leftmargin=0.15in, label={}]
  \\item \\small{
"""
        lang_parts = []
        for lang in resume.languages:
            lname = escape_latex(lang.get("name", ""))
            lprof = escape_latex(lang.get("proficiency", ""))
            prof_str = f" ({lprof})" if lprof else ""
            lang_parts.append(f"\\textbf{{{lname}}}{prof_str}")
        latex += ", ".join(lang_parts)
        latex += """
  }
\\end{itemize}
"""

    latex += "\n\\end{document}\n"
    return latex

def generate_cover_letter_latex(letter: CoverLetterResult) -> str:
    """Generate professional LaTeX code for the cover letter."""
    recipient = escape_latex(letter.recipient_name)
    company = escape_latex(letter.company_name)
    date = escape_latex(letter.date)
    salutation = escape_latex(letter.salutation)
    body = escape_latex(letter.body).replace("\n", "\n\n")
    signoff = escape_latex(letter.signoff).replace("\n", "\\\\\n")
    
    latex = f"""\\documentclass[letterpaper,11pt]{{article}}
\\usepackage[utf8]{{inputenc}}
\\usepackage{{geometry}}
\\geometry{{letterpaper, margin=1.0in}}
\\usepackage{{hyperref}}
\\usepackage{{times}}

\\setlength{{\\parindent}}{{0pt}}
\\setlength{{\\parskip}}{{10pt}}

\\begin{{document}}
\\pagestyle{{empty}}

\\textbf{{Date:}} {date}

\\textbf{{To:}} \\\\
{recipient} \\\\
{company}

{salutation}

{body}

{signoff}

\\end{{document}}
"""
    return latex
