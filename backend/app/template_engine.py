import os
import json
import logging
from typing import List, Dict, Any, Optional
from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

# Base directory for templates
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")

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

class TemplateEngine:
    def __init__(self):
        self.templates_dir = TEMPLATES_DIR
        if not os.path.exists(self.templates_dir):
            os.makedirs(self.templates_dir, exist_ok=True)

        # Configure Jinja2 to use standard delimiters
        self.env = Environment(
            loader=FileSystemLoader(self.templates_dir),
            trim_blocks=True,
            lstrip_blocks=True
        )
        self.env.filters['escape_latex'] = escape_latex
        self._templates_cache: List[Dict[str, Any]] = []
        self._load_templates()

    def _load_templates(self):
        """Scans the templates directory for metadata.json and caches them."""
        self._templates_cache = []
        for item in os.listdir(self.templates_dir):
            item_path = os.path.join(self.templates_dir, item)
            if os.path.isdir(item_path):
                metadata_file = os.path.join(item_path, "metadata.json")
                if os.path.exists(metadata_file):
                    try:
                        with open(metadata_file, "r", encoding="utf-8") as f:
                            metadata = json.load(f)
                            # Verify essential fields
                            if "id" in metadata and "name" in metadata:
                                # Update preview path to be a relative URL endpoint
                                metadata["preview_url"] = f"/templates/{metadata['id']}/{metadata.get('preview', 'preview.png')}"
                                self._templates_cache.append(metadata)
                            else:
                                logger.warning(f"Template {item} missing 'id' or 'name' in metadata.json")
                    except Exception as e:
                        logger.error(f"Failed to load metadata for template {item}: {e}")

        # Sort templates by name
        self._templates_cache.sort(key=lambda x: x.get("name", ""))

    def get_all_templates(self) -> List[Dict[str, Any]]:
        """Returns metadata for all available templates."""
        # Refresh cache to pick up new templates dynamically during dev
        self._load_templates()
        return self._templates_cache

    def get_template_metadata(self, template_id: str) -> Optional[Dict[str, Any]]:
        self._load_templates()
        for t in self._templates_cache:
            if t["id"] == template_id:
                return t
        return None

    def render_template(self, template_id: str, data: Dict[str, Any]) -> str:
        """Renders the main.tex for a given template_id with data."""
        # verify template exists
        metadata = self.get_template_metadata(template_id)
        if not metadata:
            raise ValueError(f"Template '{template_id}' not found.")
            
        template_path = f"{template_id}/main.tex"
        try:
            jinja_template = self.env.get_template(template_path)
            return jinja_template.render(**data)
        except Exception as e:
            logger.error(f"Failed to render template {template_id}: {e}")
            raise

# Singleton instance
template_engine = TemplateEngine()
