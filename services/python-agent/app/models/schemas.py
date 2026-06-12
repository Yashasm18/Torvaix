from pydantic import BaseModel
from typing import List

class Relationship(BaseModel):
    source: str
    relation: str
    target: str

class MemoryIntelligenceResponse(BaseModel):
    category: str
    importance: float
    entities: List[str]
    tags: List[str]
    relationships: List[Relationship]

class MemoryIntelligenceRequest(BaseModel):
    text: str
