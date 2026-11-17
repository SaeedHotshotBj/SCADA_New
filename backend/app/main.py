from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import ALLOW_ORIGINS, DEMO_TELEMETRY
from .database import connect, initialize_schema, json_load
from .dependencies import get_current_user
from .seed import seed_database
from .routers import auth, edges, operations, resources, telemetry, analytics, edge_ingest


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_schema()
    seed_database()
    stop_event = asyncio.Event()
    simulator_task = None
    if DEMO_TELEMETRY:
        simulator_task = asyncio.create_task(telemetry.demo_simulator_loop(stop_event))
    app.state.simulator_stop = stop_event
    try:
        yield
    finally:
        stop_event.set()
        if simulator_task:
            await simulator_task


app = FastAPI(
    title="SCADA_New Backend",
    version="0.2.0",
    description="Application backend for SCADA_New. Live values are explicitly labelled DEMO unless connected through a commissioned adapter.",
    lifespan=lifespan,
)

origins = ALLOW_ORIGINS or [
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Edge-Token"],
)

app.include_router(auth.router)
app.include_router(resources.router)
app.include_router(operations.router)
app.include_router(edges.router)
app.include_router(telemetry.router)
app.include_router(analytics.router)
app.include_router(edge_ingest.router)


@app.get("/health")
def health():
    return {"status":"ok","service":"scada-new-api","telemetry_mode":"DEMO" if DEMO_TELEMETRY else "STORED_ONLY"}


@app.get("/api/bootstrap")
def bootstrap(user: dict = Depends(get_current_user)):
    collections = [
        "factories","plcs","tags","alarms","trends","reports","processes","templates",
        "orders","units","qc","batches","productionRuns","workflowTasks","products","machines","prices","hmiPages","machineCalendars","batchConfigs","controlPlans","productFields","downtimeReasons","inputTypes","stopLines","outputTypes","documentSequences","productionRules",
    ]
    data={}
    with connect() as db:
        for collection in collections:
            if user["role"] == "Organization Admin":
                rows = db.execute(
                    "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection=? ORDER BY created_at DESC",
                    (collection,),
                ).fetchall()
            elif collection == "factories":
                rows = db.execute(
                    "SELECT id,factory_id,payload,created_at,updated_at FROM resources WHERE collection=? AND id=?",
                    (collection, user.get("factory_id") or ""),
                ).fetchall()
            else:
                rows = db.execute(
                    """SELECT id,factory_id,payload,created_at,updated_at FROM resources
                       WHERE collection=? AND (factory_id=? OR factory_id IS NULL) ORDER BY created_at DESC""",
                    (collection, user.get("factory_id")),
                ).fetchall()
            data[collection]=[
                {"id":row["id"],**(json_load(row["payload"],{}) or {}),
                 **({"factory_id":row["factory_id"]} if row["factory_id"] else {}),
                 "created_at":row["created_at"],"updated_at":row["updated_at"]}
                for row in rows
            ]
        if user["role"] == "Organization Admin":
            users = db.execute("SELECT id,email,name,role,status,factory_id,created_at,updated_at FROM users ORDER BY created_at").fetchall()
            data["users"] = [dict(row) for row in users]
        elif user["role"] == "Factory Admin":
            users = db.execute(
                "SELECT id,email,name,role,status,factory_id,created_at,updated_at FROM users WHERE factory_id=? OR id=? ORDER BY created_at",
                (user.get("factory_id"), user["id"]),
            ).fetchall()
            data["users"] = [dict(row) for row in users]
        else:
            data["users"] = [{
                "id": user["id"], "email": user["email"], "name": user["name"],
                "role": user["role"], "status": user["status"], "factory_id": user.get("factory_id"),
            }]
        if user["role"] == "Organization Admin":
            edge_rows = db.execute(
                "SELECT id,factory_id,name,status,metadata,last_seen,created_at,updated_at FROM edge_devices ORDER BY created_at DESC"
            ).fetchall()
        else:
            edge_rows = db.execute(
                "SELECT id,factory_id,name,status,metadata,last_seen,created_at,updated_at FROM edge_devices WHERE factory_id=?",
                (user.get("factory_id"),),
            ).fetchall()
        data["edgeDevices"]=[
            {"id":r["id"],"factory_id":r["factory_id"],"name":r["name"],"status":r["status"],
             "metadata":json_load(r["metadata"],{}),"last_seen":r["last_seen"],
             "created_at":r["created_at"],"updated_at":r["updated_at"]}
            for r in edge_rows
        ]
    return {"user":user,"data":data,"mode":"DEMO" if DEMO_TELEMETRY else "STORED_ONLY"}
