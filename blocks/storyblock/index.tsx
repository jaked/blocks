import { useState } from "react";
import * as BabelParser from "@babel/parser";
import type * as BabelTypes from "@babel/types";
import Path from "path-browserify";
import { FileBlockProps } from "@githubnext/blocks";
import {
  Box,
  Checkbox,
  FormControl,
  Heading,
  Select,
  TextInput,
  ToggleSwitch,
} from "@primer/react";
import * as Evergreen from "evergreen-ui";

type Type =
  | { type: "string" }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "enum"; values: string[] };

module Type {
  export const string: Type = { type: "string" };
  export const number: Type = { type: "number" };
  export const boolean: Type = { type: "boolean" };

  export const enum_: (...values: string[]) => Type = (...values) => ({
    type: "enum",
    values,
  });
}

type Prop = {
  name: string;
  type: Type;
  value: unknown;
};

type Component = {
  name: string;
  component: (props: any) => JSX.Element;
  props: Prop[];
};

type ControlProps = {
  type: Type;
  value: unknown;
  setValue: (value: unknown) => void;
};

const Control = ({ type, value, setValue }: ControlProps) => {
  switch (type.type) {
    case "string":
      return (
        <TextInput
          value={value as string}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
      );

    case "number":
      return (
        <TextInput
          value={String(value)}
          onChange={(e) => setValue(Number(e.currentTarget.value))}
        />
      );

    case "boolean":
      return (
        <Checkbox
          checked={Boolean(value)}
          onChange={(e) => setValue(Boolean(e.currentTarget.checked))}
        />
      );

    case "enum":
      return (
        <Select onChange={(e) => setValue(e.currentTarget.value)}>
          {type.values.map((v) => (
            <Select.Option key={v} value={v} selected={v === value}>
              {v}
            </Select.Option>
          ))}
        </Select>
      );
  }
};

type ComponentProps = {
  name: string;
  Component: (props: any) => JSX.Element;
  props: Prop[];
};

const Component = ({ name, props, Component }: ComponentProps) => {
  const [showPropSheet, setShowPropSheet] = useState(true);
  const [state, setState] = useState(
    Object.fromEntries(props.map((prop) => [prop.name, prop.value]))
  );

  return (
    <Box p={2}>
      <Box display="flex">
        <Box flex="1">
          <Heading>{name}</Heading>
        </Box>
        <Box alignSelf={"center"}>
          <ToggleSwitch
            checked={showPropSheet}
            onClick={() => {
              setShowPropSheet(!showPropSheet);
            }}
            statusLabelPosition={"end"}
          />
        </Box>
      </Box>
      <Box p={4}>
        <Component {...state} />
      </Box>
      {showPropSheet && (
        <Box p={2} display="grid" gridGap={3}>
          {props.map((prop) => (
            <FormControl key={prop.name}>
              <FormControl.Label>{prop.name}</FormControl.Label>
              <Box alignSelf={"left"}>
                <Control
                  type={prop.type}
                  value={state[prop.name]}
                  setValue={(value: unknown) => {
                    setState({ ...state, [prop.name]: value });
                  }}
                />
              </Box>
            </FormControl>
          ))}
        </Box>
      )}
    </Box>
  );
};

function collectFirst<T, U>(
  items: T[],
  fn: (item: T) => U | undefined
): U | undefined {
  for (const item of items) {
    const u = fn(item);
    if (u !== undefined) return u;
  }
  return undefined;
}

function collect<T, U>(items: T[], fn: (item: T) => U | undefined): U[] {
  const us: U[] = [];
  for (const item of items) {
    const u = fn(item);
    if (u !== undefined) us.push(u);
  }
  return us;
}

function typeOfPropType(
  ast:
    | BabelTypes.ObjectProperty["value"]
    | BabelTypes.ArrayExpression["elements"][0]
): Type | undefined {
  if (ast === null) return;
  if (
    ast.type === "MemberExpression" &&
    ast.object.type === "Identifier" &&
    ast.object.name === "PropTypes" &&
    ast.property.type === "Identifier"
  ) {
    switch (ast.property.name) {
      case "string":
        return Type.string;
      case "number":
        return Type.number;
      case "bool":
        return Type.boolean;

      // TODO
      case "node":
        return Type.string;
    }
  } else if (
    ast.type === "CallExpression" &&
    ast.callee.type === "MemberExpression" &&
    ast.callee.object.type === "Identifier" &&
    ast.callee.object.name === "PropTypes" &&
    ast.callee.property.type === "Identifier"
  ) {
    switch (ast.callee.property.name) {
      case "oneOf": {
        if (ast.arguments[0]?.type !== "ArrayExpression") return;
        const values = collect(ast.arguments[0].elements, (ast) => {
          if (ast && ast.type === "StringLiteral") return ast.value;
        });
        return Type.enum_(...values);
      }

      case "oneOfType": {
        if (ast.arguments[0]?.type !== "ArrayExpression") return;
        const types = collect(ast.arguments[0].elements, typeOfPropType);
        if (types.length === 1) return types[0];
        if (types.length === 2 && types[0] === types[1]) return types[0];
      }
    }
  }
}

function valueOfType(name: string, type: Type): unknown {
  switch (type.type) {
    case "string":
      if (name === "className") return "";
      if (name === "color") return "orange";
      if (name === "title") return "I'm the title!";
      return "I'm a string!";
    case "number":
      return 7;
    case "boolean":
      if (name === "hasIcon") return true;
      if (name === "hasCancel") return true;
      if (name === "hasClose") return true;
      if (name === "shouldCloseOnEscapePress") return true;
      if (name === "shouldCloseOnOverlayClick") return true;
      return false;
    case "enum":
      return type.values[0];
  }
}

function parsePropTypes(name: string, content: string): Prop[] {
  const ast = BabelParser.parse(content, {
    sourceType: "module",
    plugins: ["jsx"],
  });

  const propTypes = collectFirst(ast.program.body, (ast) => {
    if (
      ast.type === "ExpressionStatement" &&
      ast.expression.type === "AssignmentExpression" &&
      ast.expression.left.type === "MemberExpression" &&
      ast.expression.left.object.type === "Identifier" &&
      ast.expression.left.object.name === name &&
      ast.expression.left.property.type === "Identifier" &&
      ast.expression.left.property.name === "propTypes" &&
      ast.expression.right.type === "ObjectExpression"
    ) {
      return ast.expression.right.properties;
    }
  });
  if (!propTypes) return [];

  const props = collect(propTypes, (propType) => {
    if (
      propType.type === "ObjectProperty" &&
      propType.key.type === "Identifier"
    ) {
      const name = propType.key.name;
      let type = typeOfPropType(propType.value);
      if (!type) return undefined;
      const value = valueOfType(name, type);

      return { name, type, value };
    }
  });

  return props;
}

type PropFixup =
  | {
      kind: "replace";
      name: string;
      type: Type;
      value: unknown;
    }
  | {
      kind: "remove";
      name: string;
    };

const propFixups: Record<string, PropFixup[]> = {
  Alert: [
    { kind: "remove", name: "appearance" },
    {
      kind: "replace",
      name: "intent",
      type: Type.enum_("none", "success", "warning", "danger"),
      value: "success",
    },
    {
      kind: "replace",
      name: "children",
      type: Type.string,
      value: "I'm an Alert!",
    },
  ],
  InlineAlert: [
    {
      kind: "replace",
      name: "intent",
      type: Type.enum_("none", "success", "warning", "danger"),
      value: "success",
    },
    {
      kind: "replace",
      name: "size",
      type: Type.enum_("small", "medium", "large"),
      value: "medium",
    },
    {
      kind: "replace",
      name: "children",
      type: Type.string,
      value: "I'm an InlineAlert!",
    },
  ],
  Badge: [
    {
      kind: "replace",
      name: "children",
      type: Type.string,
      value: "I'm a Badge!",
    },
  ],
  Button: [
    {
      kind: "replace",
      name: "appearance",
      type: Type.enum_("default", "primary", "minimal"),
      value: "primary",
    },
    {
      kind: "replace",
      name: "intent",
      type: Type.enum_("none", "success", "danger"),
      value: "success",
    },
    {
      kind: "replace",
      name: "children",
      type: Type.string,
      value: "I'm a Button!",
    },
  ],
  IconButton: [
    {
      kind: "replace",
      name: "appearance",
      type: Type.enum_("default", "primary", "minimal"),
      value: "primary",
    },
    {
      kind: "replace",
      name: "intent",
      type: Type.enum_("none", "success", "danger"),
      value: "success",
    },
  ],
  TextDropdownButton: [
    {
      kind: "replace",
      name: "children",
      type: Type.string,
      value: "I'm a Button!",
    },
  ],
  Dialog: [
    {
      kind: "replace",
      name: "intent",
      type: Type.enum_("none", "success", "warning", "danger"),
      value: "success",
    },
    {
      kind: "replace",
      name: "children",
      type: Type.string,
      value: "I'm a Dialog!",
    },
  ],
};

function fixupProps(
  propFixups: undefined | PropFixup[],
  props: Prop[]
): Prop[] {
  if (propFixups) {
    for (const propFixup of propFixups) {
      switch (propFixup.kind) {
        case "replace":
          props = [
            ...props.filter(({ name }) => name !== propFixup.name),
            {
              name: propFixup.name,
              type: propFixup.type,
              value: propFixup.value,
            },
          ];
          break;
        case "remove":
          props = props.filter(({ name }) => name !== propFixup.name);
          break;
      }
    }
  }
  return props;
}

export default (props: FileBlockProps) => {
  const pathParts = Path.parse(props.context.file);
  const name = pathParts.name;
  const component = Evergreen[name];
  let componentProps = parsePropTypes(name, props.content);
  componentProps = fixupProps(propFixups[name], componentProps);

  return (
    <Component
      key={name}
      name={name}
      props={componentProps}
      Component={component}
    />
  );
};
