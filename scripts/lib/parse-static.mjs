import { parseExpressionAt } from "acorn";

function evaluateNode(node) {
  switch (node.type) {
    case "Literal":
      return node.value;
    case "TemplateLiteral":
      if (node.expressions.length) throw new Error("Template expressions are not allowed in source data");
      return node.quasis.map((part) => part.value.cooked).join("");
    case "ArrayExpression":
      return node.elements.map((entry) => (entry ? evaluateNode(entry) : null));
    case "ObjectExpression":
      return Object.fromEntries(
        node.properties.map((property) => {
          if (property.type !== "Property" || property.kind !== "init" || property.computed) {
            throw new Error(`Unsupported object property: ${property.type}`);
          }
          const key = property.key.type === "Identifier" ? property.key.name : evaluateNode(property.key);
          return [key, evaluateNode(property.value)];
        }),
      );
    case "UnaryExpression": {
      const value = evaluateNode(node.argument);
      if (node.operator === "!") return !value;
      if (node.operator === "-") return -value;
      if (node.operator === "+") return +value;
      throw new Error(`Unsupported unary operator: ${node.operator}`);
    }
    case "Identifier":
      if (node.name === "undefined") return undefined;
      throw new Error(`Unexpected identifier in source data: ${node.name}`);
    default:
      throw new Error(`Unsupported JavaScript node in source data: ${node.type}`);
  }
}

export function parseAssignedLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Could not locate source marker: ${marker}`);
  const expressionStart = markerIndex + marker.length;
  const expression = parseExpressionAt(source, expressionStart, { ecmaVersion: "latest" });
  return evaluateNode(expression);
}

export function parseAssignedLiteralBySourceLabel(source, sourceLabel, requiredArrayKey) {
  const labelIndex = source.indexOf(sourceLabel);
  if (labelIndex < 0) throw new Error(`Could not locate source dataset label: ${sourceLabel}`);

  // Production bundles minify top-level identifiers on every build. Locate the
  // assignment immediately preceding the stable semantic _source label instead
  // of coupling the refresh job to an unstable name such as `Ps` or `Os`.
  const searchStart = Math.max(0, labelIndex - 2_048);
  const prefix = source.slice(searchStart, labelIndex);
  const assignmentPattern = /\b(?:var|let|const)\s+[$A-Z_a-z][$\w]*\s*=\s*/g;
  let assignment = null;
  for (const match of prefix.matchAll(assignmentPattern)) assignment = match;
  if (!assignment) throw new Error(`Could not locate assignment for source dataset: ${sourceLabel}`);

  const expressionStart = searchStart + assignment.index + assignment[0].length;
  const expression = parseExpressionAt(source, expressionStart, { ecmaVersion: "latest" });
  const value = evaluateNode(expression);
  if (!value || typeof value !== "object" || value._source !== sourceLabel) {
    throw new Error(`Source dataset label did not match parsed assignment: ${sourceLabel}`);
  }
  if (requiredArrayKey && (!Array.isArray(value[requiredArrayKey]) || value[requiredArrayKey].length === 0)) {
    throw new Error(`Source dataset field was empty: ${requiredArrayKey}`);
  }
  return value;
}
