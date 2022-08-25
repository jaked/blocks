import Path from "path-browserify";
import { useEffect, useState } from "react";
import * as esbuild from "esbuild-wasm";
import { FileBlockProps } from "@githubnext/blocks";

// with grateful thanks to https://github.com/lukedxvxes/esbuild-in-browser/

export const inputPlugin = (input: string) => {
  return {
    name: "input-plugin",
    setup(build: esbuild.PluginBuild) {
      build.onResolve({ filter: /^index\.js$/ }, (args) => {
        return {
          path: args.path,

          // set namespace so esbuild doesn't try to read from fs
          // https://esbuild.github.io/plugins/#namespaces
          namespace: "local",
        };
      });

      build.onLoad(
        { filter: /^index\.js$/, namespace: "local" },
        async (args) => {
          return {
            contents: input,

            // TODO(jaked) derive from file extension
            loader: "jsx",
          };
        }
      );

      build.onResolve({ filter: /.*/ }, (args) => {
        const path = args.path.startsWith(".")
          ? Path.join(args.resolveDir.substring(1), args.path)
          : args.path;

        return {
          path: path,
          namespace: "unpkg",
        };
      });

      build.onLoad({ filter: /.*/, namespace: "unpkg" }, async (args) => {
        const url = `https://unpkg.com/${args.path}`;
        const response = await fetch(url);
        const body = await response.text();

        return {
          contents: body,
          resolveDir: Path.dirname(new URL(response.url).pathname).substring(1),
        };
      });
    },
  };
};

export default function (props: FileBlockProps) {
  const { content } = props;
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    esbuild
      .initialize({
        // TODO(jaked) get this from block bundle somehow
        // maybe via https://esbuild.github.io/plugins/#webassembly-plugin ?
        wasmURL: "https://www.unpkg.com/esbuild-wasm@0.15.5/esbuild.wasm",
      })
      .then(() => setInitialized(true));
  }, []);

  useEffect(() => {
    if (!initialized) return;

    esbuild
      .build({
        bundle: true,
        entryPoints: ["index.js"],
        plugins: [inputPlugin(content)],
      })
      .then((result) => {
        if (result.outputFiles && result.outputFiles[0]) {
          eval(result.outputFiles[0].text);
        }
      });
  });

  return <div id="root" />;
}
