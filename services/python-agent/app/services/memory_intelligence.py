import spacy
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from typing import List, Dict, Any

# Graceful loading of spaCy model
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    import subprocess
    import sys
    print("Downloading spaCy model 'en_core_web_sm'...")
    subprocess.check_call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
    nlp = spacy.load("en_core_web_sm")

# Lazy load sentence transformer to avoid slow boot if not used immediately
_model = None
def get_model():
    global _model
    if _model is None:
        print("Loading SentenceTransformer model 'all-MiniLM-L6-v2'...")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model

CATEGORIES = ["Task", "Fact", "Idea", "Event", "Contact", "Project"]

def categorize_text(text: str) -> str:
    """Categorize text using semantic similarity to predefined categories."""
    model = get_model()
    text_emb = model.encode(text)
    cat_embs = model.encode(CATEGORIES)
    
    similarities = cosine_similarity([text_emb], cat_embs)[0]
    best_idx = similarities.argmax()
    return CATEGORIES[best_idx]

def extract_intelligence(text: str) -> Dict[str, Any]:
    """Process text to extract memory intelligence metadata."""
    doc = nlp(text)
    
    # 1. Entity Extraction
    # Deduplicate entities by text while preserving type
    entities = []
    seen_texts = set()
    for ent in doc.ents:
        if ent.text not in seen_texts:
            seen_texts.add(ent.text)
            entities.append({
                "text": ent.text,
                "type": ent.label_
            })
    
    # 2. Tag Generation (Key Noun Phrases)
    tags = list(set([chunk.root.lemma_.lower() for chunk in doc.noun_chunks 
                     if not chunk.root.is_stop and chunk.root.is_alpha]))
    
    # 3. Importance Scoring (Heuristic based)
    # Base importance 5.0 + bonus for entities and overall length
    importance = 5.0 + (len(entities) * 0.5) + (len(doc) * 0.05)
    # Look for urgency keywords
    urgency_words = {"urgent", "important", "asap", "critical", "remember", "todo"}
    if any(word.text.lower() in urgency_words for word in doc):
        importance += 2.0
        
    importance = round(min(10.0, importance), 1)
    
    # 4. Categorization
    category = categorize_text(text)
    
    # 5. Relationship Detection (Subject -> Verb -> Object/Attribute)
    relationships = []
    for token in doc:
        if token.dep_ in ("nsubj", "nsubjpass"):
            subject = token.text
            verb = token.head.lemma_
            # Find the object of the verb
            for child in token.head.children:
                if child.dep_ in ("dobj", "pobj", "attr", "prep"):
                    target = child.text
                    
                    # If it's a preposition, get its object
                    if child.dep_ == "prep":
                        for prep_child in child.children:
                            if prep_child.dep_ == "pobj":
                                target = prep_child.text
                                verb = f"{verb}_{child.lemma_}"
                                break
                    
                    relationships.append({
                        "source": subject,
                        "relation": verb,
                        "target": target
                    })
    
    # Deduplicate relationships
    unique_rels = []
    seen_rels = set()
    for rel in relationships:
        key = (rel['source'], rel['relation'], rel['target'])
        if key not in seen_rels:
            seen_rels.add(key)
            unique_rels.append(rel)
            
    return {
        "category": category,
        "importance": importance,
        "entities": entities,
        "tags": tags[:8], # limit to top 8 tags
        "relationships": unique_rels
    }
