import type { Rule } from "eslint";

export const noReactNamespaceImport: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require named imports from React",
    },
    messages: {
      namespaceImport:
        "Import only the React exports used by this module instead of using a namespace import.",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (
          node.source.value === "react" &&
          node.specifiers.some(
            (specifier) => specifier.type === "ImportNamespaceSpecifier",
          )
        ) {
          context.report({ node, messageId: "namespaceImport" });
        }
      },
    };
  },
};

function isPropertyNamed(
  member: {
    computed: boolean;
    property: { type: string; name?: string; value?: unknown };
  },
  name: string,
): boolean {
  return member.computed
    ? member.property.type === "Literal" && member.property.value === name
    : member.property.type === "Identifier" && member.property.name === name;
}

export const noWindowLocationReload: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow reloads that bypass TanStack Router",
    },
    messages: {
      reload:
        "Do not use window.location.reload(); use TanStack Router navigation instead.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          !isPropertyNamed(callee, "reload") ||
          callee.object.type !== "MemberExpression" ||
          !isPropertyNamed(callee.object, "location") ||
          callee.object.object.type !== "Identifier" ||
          callee.object.object.name !== "window"
        ) {
          return;
        }

        context.report({ node, messageId: "reload" });
      },
    };
  },
};
