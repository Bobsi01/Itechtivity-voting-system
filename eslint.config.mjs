import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "out/**",
      "storage/**",
      "certificates/**",
      "functions/**",
      "node_modules/**",
    ],
  },
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
