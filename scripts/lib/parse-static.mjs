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
