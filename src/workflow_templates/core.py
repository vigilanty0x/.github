"""Bounded DAG templates with non-structural variable substitution."""

import json
import math
import re

MAX_STEPS = 1_000
MAX_VARIABLES = 100
MAX_VALUE_BYTES = 10_000
MAX_TEMPLATE_BYTES = 2_000_000
VARIABLE = re.compile(r"\{\{([A-Z][A-Z0-9_]{0,63})\}\}")


def _json_size(value, label):
    try:
        encoded = json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must contain finite JSON values") from exc
    if len(encoded) > MAX_TEMPLATE_BYTES:
        raise ValueError(f"{label} byte limit exceeded")


def _structural(value, label):
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > 256:
        raise ValueError(f"{label} must be a bounded nonempty string")
    if "{{" in value or "}}" in value:
        raise ValueError("variables are forbidden in structural fields")
    return value


def validate(template):
    if not isinstance(template, dict) or set(template) != {"steps"}:
        raise ValueError("template must contain exactly steps")
    _json_size(template, "template")
    steps = template["steps"]
    if not isinstance(steps, list) or not 1 <= len(steps) <= MAX_STEPS:
        raise ValueError("steps must be a bounded nonempty list")
    identifiers = []
    graph = {}
    for step in steps:
        if not isinstance(step, dict) or "id" not in step or any(not isinstance(key, str) for key in step):
            raise ValueError("each step must be an object with an id")
        identifier = _structural(step["id"], "step id")
        dependencies = step.get("depends_on", [])
        if not isinstance(dependencies, list) or len(dependencies) > MAX_STEPS or len(dependencies) != len(set(dependencies)):
            raise ValueError("depends_on must be a bounded unique list")
        dependencies = [_structural(dependency, "dependency") for dependency in dependencies]
        identifiers.append(identifier)
        graph[identifier] = dependencies
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("duplicate step")
    known = set(identifiers)
    if any(set(dependencies) - known for dependencies in graph.values()):
        raise ValueError("unknown dependency")
    indegree = {identifier: len(dependencies) for identifier, dependencies in graph.items()}
    dependants = {identifier: [] for identifier in identifiers}
    for identifier, dependencies in graph.items():
        for dependency in dependencies:
            dependants[dependency].append(identifier)
    ready = [identifier for identifier, degree in indegree.items() if degree == 0]
    visited = 0
    while ready:
        current = ready.pop()
        visited += 1
        for dependant in dependants[current]:
            indegree[dependant] -= 1
            if indegree[dependant] == 0:
                ready.append(dependant)
    if visited != len(identifiers):
        raise ValueError("cycle")
    return True


def _variables(variables):
    if not isinstance(variables, dict) or len(variables) > MAX_VARIABLES:
        raise ValueError("variables must be a bounded object")
    for key, value in variables.items():
        if not isinstance(key, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}", key):
            raise ValueError("invalid variable name")
        if isinstance(value, (dict, list)) or not isinstance(value, (str, int, float, bool)):
            raise ValueError("variable values must be JSON scalars")
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("variable values must be finite")
        if len(str(value).encode("utf-8")) > MAX_VALUE_BYTES:
            raise ValueError("variable value byte limit exceeded")


def instantiate(template, variables):
    validate(template)
    _variables(variables)

    def substitute(value, structural=False):
        if structural:
            return value
        if isinstance(value, str):
            def replace(match):
                key = match.group(1)
                if key not in variables:
                    raise ValueError("missing variable")
                return str(variables[key])

            result = VARIABLE.sub(replace, value)
            if "{{" in result or "}}" in result:
                raise ValueError("invalid variable expression")
            return result
        if isinstance(value, list):
            return [substitute(item) for item in value]
        if isinstance(value, dict):
            return {key: substitute(item) for key, item in value.items()}
        return value

    instantiated_steps = []
    for step in template["steps"]:
        instantiated_steps.append({key: substitute(value, structural=key in {"id", "depends_on"}) for key, value in step.items()})
    result = {"steps": instantiated_steps}
    validate(result)
    return result


def run(data):
    if not isinstance(data, dict) or set(data) != {"template", "variables"}:
        raise ValueError("input must contain exactly template and variables")
    return instantiate(**data)
