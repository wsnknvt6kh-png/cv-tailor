import os
import json
import requests
from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
import pypdf
from bs4 import BeautifulSoup
from google import genai
from google.genai import types
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing, Line

app = Flask(__name__)
CORS(app)

# Serve the frontend UI
@app.route('/')
def index():
    return render_template('index.html')


def scrape_url(url):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Decompose script, style, nav, footer, header elements
        for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
            element.decompose()
            
        # Extract text content
        raw_text = soup.get_text(separator=' ')
        
        # Clean up whitespace
        lines = (line.strip() for line in raw_text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        clean_text = '\n'.join(chunk for chunk in chunks if chunk)
        
        return clean_text
    except Exception as e:
        raise Exception(f"Failed to scrape URL: {str(e)}")

# Helper to extract text from a CV PDF file
def extract_pdf_text(file_stream):
    try:
        reader = pypdf.PdfReader(file_stream)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception as e:
        raise Exception(f"Failed to read PDF file: {str(e)}")

# Endpoint to analyze CV and Job Description
@app.route('/api/analyze', methods=['POST'])
def analyze():
    try:
        # Check if PDF file is provided
        if 'cv' not in request.files:
            return jsonify({"error": "Missing CV file (PDF)"}), 400
            
        cv_file = request.files['cv']
        if cv_file.filename == '':
            return jsonify({"error": "No selected file"}), 400
            
        # Get Job Description text or URL
        jd_text = request.form.get('job_description_text', '').strip()
        jd_url = request.form.get('job_description_url', '').strip()
        
        if not jd_text and not jd_url:
            return jsonify({"error": "Please provide either a Job Description text or a Job Description URL"}), 400
            
        # Resolve Job Description
        if jd_url:
            try:
                scraped_text = scrape_url(jd_url)
                # Combine scraped text with any custom text provided
                jd_text = f"{jd_text}\n\n[Scraped Job Description Content]:\n{scraped_text}".strip()
            except Exception as e:
                return jsonify({"error": f"Failed to scrape job description: {str(e)}"}), 500
                
        # Parse PDF
        try:
            cv_text = extract_pdf_text(cv_file)
        except Exception as e:
            return jsonify({"error": f"Failed to extract text from CV: {str(e)}"}), 400
            
        if not cv_text:
            return jsonify({"error": "The uploaded PDF appears to contain no readable text."}), 400
            
        # Initialize Gemini API Client
        # Fallback priority:
        # 1. API key in header 'X-Gemini-Key'
        # 2. Environment variable 'GEMINI_API_KEY'
        api_key = request.headers.get("X-Gemini-Key") or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return jsonify({"error": "Missing Gemini API Key. Please provide it in the settings panel or set the GEMINI_API_KEY environment variable."}), 400
            
        try:
            client = genai.Client(api_key=api_key)
        except Exception as e:
            return jsonify({"error": f"Failed to initialize Gemini Client: {str(e)}"}), 500
            
        # Build prompt for Gemini
        prompt = f"""
You are an expert resume writer and ATS optimization specialist. 
Your task is to:
1. Parse the CV text into structured details.
2. Analyze the Job Description to identify 10-15 keywords or skills (technologies, methodologies, certifications, or tools). Prioritize them by relevancy to the role.
3. Propose natural sentence rewrites within the CV (specifically in the Profile or Professional Experience bullet points) to integrate these keywords seamlessly. Keep the rewrites factually consistent with the original CV (do not invent achievements, only rephrase to include the keywords).

Input CV Text:
{cv_text}

Input Job Description:
{jd_text}

Return your output as a single JSON object. Ensure all strings are properly escaped. The schema MUST match:
{{
  "parsed_cv": {{
    "name": "Full Name",
    "title": "Professional Title",
    "contact": "Contact details line (e.g. Email | Phone | Location)",
    "profile": "Profile summary text",
    "experience": [
      {{
        "title": "Job Title",
        "company": "Company Name",
        "location": "Location",
        "date": "Dates",
        "description": "Overall job description paragraph describing general responsibilities (italicized in layout)",
        "bullets": ["Achievement Bullet 1", "Achievement Bullet 2"]
      }}
    ],
    "education": [
      {{
        "degree": "Degree Title",
        "school": "School Name",
        "date": "Dates",
        "details": "Grades, GPA, certifications, or other details"
      }}
    ],
    "skills_and_interests": {{
      "languages": ["Language 1", "Language 2"],
      "tools": ["Excel (Advanced)", "Python (Basic)"],
      "competencies": ["Competency 1", "Competency 2"],
      "interests": ["Interest 1", "Interest 2"]
    }}
  }},
  "keywords": [
    {{
      "word": "keyword",
      "priority": 1, // 1 to 15, where 1 is highest priority
      "matching_status": "missing" // "missing" or "under-represented"
    }}
  ],
  "proposals": [
    {{
      "id": "prop_1",
      "section": "experience", // "profile" or "experience"
      "entry_index": 0, // index in the experience list
      "bullet_index": 1, // index in the bullets list, or -1 for the overall description paragraph
      "original": "Original text to replace",
      "proposed": "Proposed rewritten text containing the keyword",
      "keywords": ["keyword"]
    }}
  ]
}}
"""
        
        # Call Gemini Flash
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            analysis_result = json.loads(response.text)
            return jsonify(analysis_result)
        except Exception as e:
            return jsonify({"error": f"Failed to call Gemini API: {str(e)}"}), 502
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Helper to create horizontal rules under section headers
def create_section_header(title, width):
    style = ParagraphStyle(
        name='SectionHeader',
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=12,
        textColor=colors.HexColor('#1e293b'),
        spaceAfter=2
    )
    p = Paragraph(title, style)
    
    d = Drawing(width, 3)
    d.add(Line(0, 1.5, width, 1.5, strokeColor=colors.HexColor('#cbd5e1'), strokeWidth=0.75))
    
    return [Spacer(1, 8), p, d, Spacer(1, 4)]

# Endpoint to generate tailored PDF
@app.route('/api/generate-pdf', methods=['POST'])
def generate_pdf():
    try:
        cv_data = request.json
        if not cv_data:
            return jsonify({"error": "Missing CV JSON payload"}), 400
            
        # Setup buffer
        buffer = BytesIO()
        
        # 0.45 inch margins for perfect spacing
        margin = 0.45 * inch
        page_width = 8.5 * inch
        usable_width = page_width - 2 * margin
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=margin,
            rightMargin=margin,
            topMargin=margin,
            bottomMargin=margin
        )
        
        story = []
        
        # Retrieve structures
        name = cv_data.get("name", "Name").strip()
        title = cv_data.get("title", "Professional Title").strip()
        contact = cv_data.get("contact", "").strip()
        profile = cv_data.get("profile", "").strip()
        experience = cv_data.get("experience", [])
        education = cv_data.get("education", [])
        skills_and_interests = cv_data.get("skills_and_interests", {})
        
        # Styles definition
        name_style = ParagraphStyle(
            name='CVName',
            fontName='Helvetica-Bold',
            fontSize=19,
            leading=21,
            textColor=colors.HexColor('#0f172a'),
            alignment=1
        )
        
        title_style = ParagraphStyle(
            name='CVTitle',
            fontName='Helvetica',
            fontSize=10.5,
            leading=13,
            textColor=colors.HexColor('#475569'),
            alignment=1,
            spaceAfter=3
        )
        
        contact_style = ParagraphStyle(
            name='CVContact',
            fontName='Helvetica',
            fontSize=8.5,
            leading=10.5,
            textColor=colors.HexColor('#475569'),
            alignment=1,
            spaceAfter=5
        )
        
        body_style = ParagraphStyle(
            name='CVBody',
            fontName='Helvetica',
            fontSize=8.2,
            leading=11.5,
            textColor=colors.HexColor('#334155')
        )
        
        bullet_style = ParagraphStyle(
            name='CVBullet',
            parent=body_style,
            leftIndent=11,
            firstLineIndent=-9,
            spaceAfter=2
        )
        
        job_title_style = ParagraphStyle(
            name='CVJobTitle',
            fontName='Helvetica-Bold',
            fontSize=8.8,
            leading=11,
            textColor=colors.HexColor('#1e293b')
        )
        
        job_meta_style = ParagraphStyle(
            name='CVJobMeta',
            fontName='Helvetica',
            fontSize=8.2,
            leading=11,
            textColor=colors.HexColor('#475569')
        )
        
        job_desc_style = ParagraphStyle(
            name='CVJobDesc',
            parent=body_style,
            fontName='Helvetica-Oblique',
            textColor=colors.HexColor('#475569'),
            spaceAfter=1.5
        )
        
        date_style = ParagraphStyle(
            name='CVDate',
            fontName='Helvetica',
            fontSize=8.2,
            leading=11,
            textColor=colors.HexColor('#475569'),
            alignment=2
        )
        
        # 1. Header
        story.append(Paragraph(name, name_style))
        story.append(Paragraph(title.upper(), title_style))
        
        # Replace vertical bars with bullet spaces for layout elegance
        contact_formatted = contact.replace(" | ", "   &bull;   ").replace("  ", "   &bull;   ")
        story.append(Paragraph(contact_formatted, contact_style))
        
        # 2. Profile
        if profile:
            story.extend(create_section_header("PROFILE", usable_width))
            story.append(Paragraph(profile, body_style))
            
        # 3. Experience
        if experience:
            story.extend(create_section_header("PROFESSIONAL EXPERIENCE", usable_width))
            for index, job in enumerate(experience):
                j_title = job.get("title", "")
                j_company = job.get("company", "")
                j_loc = job.get("location", "")
                j_date = job.get("date", "")
                j_desc = job.get("description", "")
                j_bullets = job.get("bullets", [])
                
                # Format company & location
                company_loc = j_company
                if j_loc:
                    company_loc += f" &bull; {j_loc}"
                
                # Job Header table
                p_title = Paragraph(j_title, job_title_style)
                p_date = Paragraph(j_date, date_style)
                t = Table([[p_title, p_date]], colWidths=[usable_width * 0.7, usable_width * 0.3])
                t.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
                    ('LEFTPADDING', (0,0), (-1,-1), 0),
                    ('RIGHTPADDING', (0,0), (-1,-1), 0),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 0),
                    ('TOPPADDING', (0,0), (-1,-1), 0),
                ]))
                
                story.append(t)
                story.append(Paragraph(company_loc, job_meta_style))
                story.append(Spacer(1, 1.5))
                
                if j_desc:
                    story.append(Paragraph(j_desc, job_desc_style))
                    story.append(Spacer(1, 1.5))
                    
                for bullet in j_bullets:
                    bullet_text = bullet.strip()
                    if not bullet_text.startswith("&bull;") and not bullet_text.startswith("•"):
                        bullet_text = f"&bull; {bullet_text}"
                    story.append(Paragraph(bullet_text, bullet_style))
                    
                if index < len(experience) - 1:
                    story.append(Spacer(1, 4))
                    
        # 4. Education
        if education:
            story.extend(create_section_header("EDUCATION", usable_width))
            for index, ed in enumerate(education):
                e_deg = ed.get("degree", "")
                e_sch = ed.get("school", "")
                e_date = ed.get("date", "")
                e_det = ed.get("details", "")
                
                p_deg = Paragraph(e_deg, job_title_style)
                p_date = Paragraph(e_date, date_style)
                t_ed = Table([[p_deg, p_date]], colWidths=[usable_width * 0.75, usable_width * 0.25])
                t_ed.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
                    ('LEFTPADDING', (0,0), (-1,-1), 0),
                    ('RIGHTPADDING', (0,0), (-1,-1), 0),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 0),
                    ('TOPPADDING', (0,0), (-1,-1), 0),
                ]))
                
                story.append(t_ed)
                story.append(Paragraph(e_sch, job_meta_style))
                if e_det:
                    story.append(Paragraph(e_det, body_style))
                if index < len(education) - 1:
                    story.append(Spacer(1, 3))
                    
        # 5. Skills & Interests
        if skills_and_interests:
            story.extend(create_section_header("SKILLS & INTERESTS", usable_width))
            
            lines = []
            
            # Format lists into bullet strings
            languages = skills_and_interests.get("languages", [])
            if languages:
                lines.append(f"<b>Languages:</b> {', '.join(languages)}")
                
            tools = skills_and_interests.get("tools", [])
            if tools:
                lines.append(f"<b>Tools:</b> {', '.join(tools)}")
                
            competencies = skills_and_interests.get("competencies", [])
            if competencies:
                lines.append(f"<b>Competencies:</b> {' &bull; '.join(competencies)}")
                
            interests = skills_and_interests.get("interests", [])
            if interests:
                lines.append(f"<b>Interests:</b> {', '.join(interests)}")
                
            skills_text = "<br/>".join(lines)
            story.append(Paragraph(skills_text, body_style))
            
        # Build document in buffer
        doc.build(story)
        
        # Reset pointer
        buffer.seek(0)
        
        return send_file(
            buffer,
            as_attachment=True,
            download_name="Tailored_CV.pdf",
            mimetype="application/pdf"
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Default to port 5000
    app.run(debug=True, host='0.0.0.0', port=5000)
