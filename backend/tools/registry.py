"""Tool registry — integrations "drop in" by decorating a function with
@tool. The agent core hands the collected declarations to Gemini for
function-calling and dispatches calls back here. Every tool that writes or
acts externally calls safety.gate.check() itself; the registry also records
each tool's permission tier for the HUD status display."""
import inspect
import logging
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger("jarvis.tools")

_PY_TO_GEMINI = {str: "STRING", int: "INTEGER", float: "NUMBER", bool: "BOOLEAN"}


@dataclass
class Tool:
    name: str
    fn: Callable
    description: str
    tier: str  # "read" | "own-write" | "gated"
    parameters: dict = field(default_factory=dict)
    required: list = field(default_factory=list)


_REGISTRY: dict[str, Tool] = {}


def tool(name: str, description: str, tier: str = "read"):
    """Register a callable as an agent tool. Parameter schema is derived from
    the function signature (annotate params with str/int/float/bool)."""
    def deco(fn: Callable):
        sig = inspect.signature(fn)
        params, required = {}, []
        for pname, p in sig.parameters.items():
            ptype = _PY_TO_GEMINI.get(p.annotation, "STRING")
            params[pname] = {"type": ptype, "description": pname.replace("_", " ")}
            if p.default is inspect.Parameter.empty:
                required.append(pname)
        _REGISTRY[name] = Tool(name=name, fn=fn, description=description,
                               tier=tier, parameters=params, required=required)
        return fn
    return deco


def all_tools() -> list[Tool]:
    return list(_REGISTRY.values())


def gemini_declarations() -> list[dict]:
    """Function declarations in the shape the google-genai SDK expects."""
    decls = []
    for t in _REGISTRY.values():
        decl: dict[str, Any] = {"name": t.name, "description": t.description}
        if t.parameters:
            decl["parameters"] = {
                "type": "OBJECT",
                "properties": t.parameters,
                "required": t.required,
            }
        decls.append(decl)
    return decls


def dispatch(name: str, args: dict) -> Any:
    """Execute a tool call coming back from the model."""
    t = _REGISTRY.get(name)
    if not t:
        return {"error": f"unknown tool: {name}"}
    try:
        return t.fn(**(args or {}))
    except TypeError as exc:
        return {"error": f"bad arguments for {name}: {exc}"}
    except Exception as exc:
        logger.exception("tool %s failed", name)
        return {"error": f"{name} failed: {exc}"}
