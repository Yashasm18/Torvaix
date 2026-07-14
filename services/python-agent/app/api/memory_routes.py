from fastapi import APIRouter, HTTPException
from app.models.schemas import MemoryIntelligenceRequest, MemoryIntelligenceResponse
from app.services.memory_intelligence import extract_intelligence
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/analyze",
    tags=["intelligence"]
)

@router.post("/memory", response_model=MemoryIntelligenceResponse)
async def analyze_memory(request: MemoryIntelligenceRequest):
    """
    Analyze raw memory text and extract intelligence:
    - Category
    - Importance score
    - Entities
    - Tags
    - Relationships (Source -> Relation -> Target)
    """
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    try:
        intelligence = extract_intelligence(request.text)
        return MemoryIntelligenceResponse(**intelligence)

    except Exception as e:
        logger.error(f"Error analyzing memory: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
