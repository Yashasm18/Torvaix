from fastapi import FastAPI
from app.api.memory_routes import router as memory_router
import logging

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TORVAIX Python Intelligence Layer",
    description="Advanced ML and AI features for Torvaix including memory intelligence, relationship extraction, and graph building.",
    version="0.1.0",
)

# No CORS headers on purpose: only the agent server and the web app's server-side routes call
# this service. Allowing every origin let any website the user visited send text here from
# their browser.

# Include routers
app.include_router(memory_router)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "torvaix-intelligence-layer"}

# Preload models on startup
@app.on_event("startup")
async def startup_event():
    logger.info("Initializing Intelligence Layer...")
    try:
        from app.services.memory_intelligence import get_model
        # This will trigger the download/load of the sentence-transformers model
        get_model()
        logger.info("Models loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to preload models: {e}")
