"""
Homework Solver - Flask Backend
A beautiful web app that solves homework questions using OpenRouter API.
"""

import os
import json
import re
from datetime import datetime
from flask import Flask, render_template, request, jsonify
import requests
from dotenv import load_dotenv
from duckduckgo_search import DDGS

load_dotenv()  # Load .env file

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20MB max for image uploads

# ============================================================
# Configuration
# ============================================================
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "YOUR_API_KEY_HERE")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Default model - you can change this
DEFAULT_MODEL = "openrouter/free"

# Vision model for image-based questions (must support image input)
VISION_MODEL = "google/gemma-4-31b"

# In-memory history (for demo; use a database in production)
question_history = []


# ============================================================
# Helper Functions
# ============================================================
def build_system_prompt(subject: str) -> str:
    """Build a system prompt tailored to the selected subject."""
    base = (
        "Ban la mot gia su chuyen nghiep. LUON LUON tra loi bang TIENG VIET. "
        "Cung cap loi giai chi tiet, ro rang, theo tung buoc. "
        "Dinh dang cau tra loi bang Markdown. "
        "Su dung ky hieu LaTeX trong $...$ cho cong thuc ngan va $$...$$ cho cong thuc dai. "
        "Su dung code blocks voi ten ngon ngu cho bat ky doan code nao. "
        "Luon giai thich ly do ro rang. "
        "QUAN TRONG: Toan bo noi dung tra loi PHAI bang tieng Viet."
    )
    subject_hints = {
        "math": "Tap trung vao su chinh xac toan hoc. Trinh bay tung buoc giai. Dung LaTeX cho moi cong thuc.",
        "programming": "Cung cap code chay duoc voi chu thich. Giai thich thuat toan va do phuc tap.",
        "physics": "Dung ky hieu vat ly chuan. Phan tich don vi. Giai thich hien tuong ro rang.",
        "chemistry": "Dung ky hieu hoa hoc chuan. Can bang phuong trinh. Giai thich co che phan ung.",
        "biology": "Dung thuat ngu sinh hoc chinh xac. Giai thich cac qua trinh tung buoc.",
        "history": "Cung cap boi canh lich su chinh xac, moc thoi gian, va phan tich nguyen nhan - ket qua.",
        "literature": "Phan tich van hoc sau sac voi dan chung tu van ban.",
        "english": "Giai thich ngu phap, tu vung tieng Anh. Dua vi du cu the.",
        "geography": "Giai thich dia ly tu nhien va xa hoi. Su dung so lieu cu the.",
        "general": "Cung cap cau tra loi toan dien, co cau truc ro rang.",
    }
    hint = subject_hints.get(subject, subject_hints["general"])
    return f"{base}\n\n{hint}"


def parse_ai_response(raw_text: str) -> dict:
    """
    Parse the AI response into structured parts:
    - answer_text: the full markdown answer
    - code_snippets: extracted code blocks
    - math_blocks: extracted LaTeX blocks
    """
    if not raw_text:
        raw_text = ""
        
    # Extract fenced code blocks
    code_pattern = r"```(\w*)\n(.*?)```"
    code_snippets = []
    for match in re.finditer(code_pattern, raw_text, re.DOTALL):
        code_snippets.append({
            "language": match.group(1) or "plaintext",
            "code": match.group(2).strip(),
        })

    # Extract display math blocks
    math_pattern = r"\$\$(.*?)\$\$"
    math_blocks = []
    for match in re.finditer(math_pattern, raw_text, re.DOTALL):
        math_blocks.append(match.group(1).strip())

    return {
        "answer_text": raw_text,
        "code_snippets": code_snippets,
        "math_blocks": math_blocks,
    }


def web_search(query: str, max_results: int = 5) -> str:
    """Search the web using DuckDuckGo and return formatted results."""
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        if not results:
            return ""
        formatted = []
        for r in results:
            title = r.get('title', '')
            body = r.get('body', '')
            href = r.get('href', '')
            formatted.append(f"- {title}: {body} (Nguon: {href})")
        return "\n".join(formatted)
    except Exception as e:
        print(f"[DEBUG] Web search error: {e}")
        return ""


def call_openrouter(question: str, subject: str, model: str = None, image_data: str = None, enable_search: bool = True) -> dict:
    """Send a question to the OpenRouter API and return the parsed response."""
    system_prompt = build_system_prompt(subject)

    # Web search for additional context (only for text questions when enabled)
    search_context = ""
    if enable_search and question and not image_data:
        print(f"[INFO] Searching web for: {question[:80]}...")
        search_context = web_search(question)
        if search_context:
            system_prompt += (
                "\n\n=== THONG TIN TIM KIEM TU INTERNET (RAT QUAN TRONG) ===\n"
                "Duoi day la ket qua tim kiem web moi nhat. "
                "Doi voi cac cau hoi ve su kien, nhan vat, thong tin thuc te, "
                "ban BAT BUOC phai dua vao thong tin nay de tra loi. "
                "KHONG DUOC tu bia thong tin. Neu thong tin tim kiem khong du, "
                "hay noi ro rang 'Theo ket qua tim kiem...' va ghi ro nguon.\n\n"
                + search_context + "\n=== HET KET QUA TIM KIEM ==="
            )
            print(f"[INFO] Found {len(search_context)} chars of web context")
        else:
            print("[INFO] No web results found")

    # If image is provided, force a vision-capable model
    if image_data:
        model = VISION_MODEL
    else:
        model = model or DEFAULT_MODEL

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "Homework Solver",
    }

    # Build user message content
    if image_data:
        # Multi-modal message with image + text (OpenAI-compatible format)
        user_content = []
        # Add the image
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": image_data  # base64 data URI: data:image/jpeg;base64,...
            },
        })
        # Add text instruction
        text_prompt = question if question else "Hay xem anh bai tap nay va giai chi tiet tung buoc. Trinh bay loi giai bang tieng Viet."
        user_content.append({
            "type": "text",
            "text": text_prompt,
        })
    else:
        user_content = question

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.3,
        "max_tokens": 4096,
    }

    try:
        resp = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=120)
        # Log response for debugging
        if resp.status_code != 200:
            body = resp.text[:500]
            print(f"[DEBUG] API error {resp.status_code}: {body}")
            return {"success": False, "error": f"API error ({resp.status_code}): {body}"}
        data = resp.json()
        raw_text = data["choices"][0]["message"]["content"] or "Xin lỗi, AI không trả về câu trả lời. Vui lòng thử model khác."
        return {
            "success": True,
            "model_used": data.get("model", model),
            **parse_ai_response(raw_text),
        }
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Het thoi gian cho. Vui long thu lai."}
    except requests.exceptions.ConnectionError:
        return {"success": False, "error": "Khong the ket noi toi API. Kiem tra internet."}
    except (KeyError, IndexError) as e:
        return {"success": False, "error": f"Dinh dang phan hoi khong mong doi: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"Loi: {str(e)}"}


# ============================================================
# Routes
# ============================================================
@app.route("/")
def index():
    """Serve the main page."""
    return render_template("index.html")


@app.route("/solve", methods=["POST"])
def solve():
    """Solve a homework question (text and/or image)."""
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"success": False, "error": "No data provided."}), 400

    question = (data.get("question") or "").strip()
    image_data = data.get("image_data")  # base64 data URI or None

    # Must have at least a question or an image
    if not question and not image_data:
        return jsonify({"success": False, "error": "Vui long nhap cau hoi hoac tai anh bai tap."}), 400

    subject = data.get("subject", "general").strip().lower()
    model = data.get("model", DEFAULT_MODEL)
    web_search = data.get("web_search", True)

    result = call_openrouter(question, subject, model, image_data=image_data, enable_search=web_search)

    # Save to history
    if result["success"]:
        question_history.insert(0, {
            "id": len(question_history) + 1,
            "question": question[:200],  # truncate for display
            "subject": subject,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "answer_preview": result["answer_text"][:150] + "...",
        })
        # Keep only last 50 items
        if len(question_history) > 50:
            question_history.pop()

    return jsonify(result)


@app.route("/history", methods=["GET"])
def history():
    """Return question history."""
    return jsonify({"history": question_history})


@app.route("/clear-history", methods=["POST"])
def clear_history():
    """Clear question history."""
    question_history.clear()
    return jsonify({"success": True})


# ============================================================
# Run
# ============================================================
if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  [*] Homework Solver - Starting...")
    print("=" * 60)
    if OPENROUTER_API_KEY == "YOUR_API_KEY_HERE":
        print("  [!] WARNING: Set OPENROUTER_API_KEY environment variable!")
        print("      Example: set OPENROUTER_API_KEY=sk-or-v1-xxxx")
    print("  [>] Open http://localhost:5000 in your browser")
    print("=" * 60 + "\n")
    app.run(debug=True, host="0.0.0.0", port=5000)
