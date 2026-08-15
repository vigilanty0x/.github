import unittest
from workflow_templates.core import validate,instantiate
class T(unittest.TestCase):
 def test_ok(self): self.assertTrue(validate({"steps":[{"id":"a"}]}))
 def test_sub(self): self.assertEqual(instantiate({"steps":[{"id":"a","value":"{{X}}"}]},{"X":1})["steps"][0]["value"],"1")
 def test_duplicate(self):
  with self.assertRaises(ValueError): validate({"steps":[{"id":"a"},{"id":"a"}]})
 def test_cycle(self):
  with self.assertRaises(ValueError): validate({"steps":[{"id":"a","depends_on":["b"]},{"id":"b","depends_on":["a"]}]})
 def test_missing_var(self):
  with self.assertRaises(ValueError): instantiate({"steps":[{"id":"a","value":"{{X}}"}]},{})
if __name__=="__main__": unittest.main()

