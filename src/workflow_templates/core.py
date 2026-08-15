import re
def validate(template):
 steps=template["steps"]
 if not 1<=len(steps)<=1000: raise ValueError("step limit")
 ids=[s["id"] for s in steps]
 if len(ids)!=len(set(ids)): raise ValueError("duplicate step")
 known=set(ids); graph={s["id"]:s.get("depends_on",[]) for s in steps}
 if any(set(v)-known for v in graph.values()): raise ValueError("unknown dependency")
 visiting=set(); done=set()
 def visit(x):
  if x in visiting: raise ValueError("cycle")
  if x in done:return
  visiting.add(x)
  for d in graph[x]:visit(d)
  visiting.remove(x);done.add(x)
 for x in ids:visit(x)
 return True
def instantiate(template,variables):
 validate(template)
 def sub(value):
  if not isinstance(value,str): return value
  def replace(m):
   key=m.group(1)
   if key not in variables: raise ValueError("missing variable")
   return str(variables[key])
  return re.sub(r"\{\{([A-Z][A-Z0-9_]*)\}\}",replace,value)
 return {"steps":[{k:sub(v) if k!="depends_on" else v for k,v in step.items()} for step in template["steps"]]}
def run(data): return instantiate(**data)

