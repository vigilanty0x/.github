import unittest

from workflow_templates.core import instantiate, validate


class WorkflowTemplateTests(unittest.TestCase):
    def test_valid_dag_and_nested_substitution(self):
        template = {"steps": [{"id": "a", "config": {"message": "hello {{NAME}}"}}, {"id": "b", "depends_on": ["a"]}]}
        result = instantiate(template, {"NAME": "world"})
        self.assertEqual(result["steps"][0]["config"]["message"], "hello world")
        self.assertTrue(validate(result))

    def test_duplicate_unknown_dependency_and_cycle_block(self):
        invalid = [
            {"steps": [{"id": "a"}, {"id": "a"}]},
            {"steps": [{"id": "a", "depends_on": ["missing"]}]},
            {"steps": [{"id": "a", "depends_on": ["b"]}, {"id": "b", "depends_on": ["a"]}]},
        ]
        for template in invalid:
            with self.subTest(template=template), self.assertRaises(ValueError):
                validate(template)

    def test_variables_are_forbidden_in_structural_fields(self):
        for template in ({"steps": [{"id": "{{ID}}"}]}, {"steps": [{"id": "a", "depends_on": ["{{DEP}}"]}]}):
            with self.subTest(template=template), self.assertRaises(ValueError):
                instantiate(template, {"ID": "a", "DEP": "a"})

    def test_missing_and_unbounded_variables_fail(self):
        template = {"steps": [{"id": "a", "value": "{{X}}"}]}
        with self.assertRaises(ValueError):
            instantiate(template, {})
        with self.assertRaises(ValueError):
            instantiate(template, {"X": "x" * 10_001})

    def test_template_shape_is_strict(self):
        for template in ({"steps": []}, {"steps": [{"id": True}]}, {"steps": [{"id": "a", "depends_on": "b"}]}, {"steps": [{"id": "a"}], "extra": 1}):
            with self.subTest(template=template), self.assertRaises(ValueError):
                validate(template)


if __name__ == "__main__":
    unittest.main()
