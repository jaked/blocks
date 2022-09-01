import Path from "path-browserify";
import { useEffect, useState } from "react";
import * as esbuild from "esbuild-wasm";
import { FileBlockProps, RepoFiles } from "@githubnext/blocks";

// with grateful thanks to https://github.com/lukedxvxes/esbuild-in-browser/

type FilesMap = Map<string, "tree" | "blob">;

function resolvePathInFilesMap(
  path: string,
  filesMap: FilesMap
): string | undefined {
  const extensions = [".js", ".jsx", ".ts", ".tsx"];
  const type = filesMap.get(path);
  if (type === "blob") {
    return path;
  } else if (type === "tree") {
    for (const ext of extensions) {
      const resolved = resolvePathInFilesMap(
        Path.join(path, "index" + ext),
        filesMap
      );
      if (resolved) return resolved;
    }
  } else if (type === undefined) {
    if (Path.extname(path) !== "") return;
    for (const ext of extensions) {
      const resolved = resolvePathInFilesMap(path + ext, filesMap);
      if (resolved) return resolved;
    }
  }
}

export const blocksPlugin = ({
  filesMap,
  context,
  content,
  fetchRepoFile,
}: {
  filesMap: FilesMap;
  context: FileBlockProps["context"];
  content: string;
  fetchRepoFile: (path: string) => Promise<string>;
}) => {
  return {
    name: "blocks-plugin",
    setup(build: esbuild.PluginBuild) {
      build.onResolve({ filter: /^__content__$/ }, (args) => {
        return {
          path: args.path,

          // set namespace so esbuild doesn't try to read from fs
          // https://esbuild.github.io/plugins/#namespaces
          namespace: "content",
        };
      });

      build.onLoad(
        { filter: /^__content__$/, namespace: "content" },
        async (args) => {
          const pluginData = JSON.parse(await fetchRepoFile("/package.json"))[
            "dependencies"
          ];

          const resolveDir = Path.dirname(context.path);
          return {
            contents: content,

            // TODO(jaked) derive from file extension
            loader: "jsx",
            resolveDir,
            pluginData,
          };
        }
      );

      // relative imports stay in the same namespace
      // except that imports from 'content' go to 'repo'
      // (since there's only one 'content' file, all others must be fetched)
      build.onResolve({ filter: /^\./ }, (args) => {
        const resolvedNamespace =
          args.namespace === "content" ? "repo" : args.namespace;
        const joinedPath = Path.join(args.resolveDir, args.path);
        const resolvedPath =
          resolvedNamespace === "repo"
            ? resolvePathInFilesMap(joinedPath, filesMap)
            : joinedPath;

        return {
          path: resolvedPath,
          namespace: resolvedNamespace,
          pluginData: args.pluginData,
        };
      });

      // bare imports go to unpkg
      build.onResolve({ filter: /.*/ }, (args) => {
        return {
          path: args.path,
          namespace: "unpkg",
          pluginData: args.pluginData,
        };
      });

      build.onLoad({ filter: /.*/, namespace: "unpkg" }, async (args) => {
        // esbuild normalizes resolveDir so it starts with /
        // so relative imports start with / since we join them to resolveDir
        const relative = args.path.startsWith("/");
        const path = relative ? args.path.substring(1) : args.path;

        // see https://www.npmjs.com/package/validate-npm-package-name
        const { pkg, rest } =
          /^(?<pkg>(@[\w.-]+\/[\w.-]+)|([\w.-]+))(?<rest>.*)$/.exec(path)
            ?.groups!;

        const nestedPluginData = relative
          ? args.pluginData
          : await (async () => {
              const url = `https://unpkg.com/${pkg}/package.json`;
              const response = await fetch(url);
              const body = await response.text();
              const dependencies = JSON.parse(body)["dependencies"];
              return dependencies;
            })();

        const version =
          args.pluginData && args.pluginData[pkg]
            ? `@${args.pluginData[pkg]}`
            : "";
        const url = `https://unpkg.com/${pkg}${version}${rest}`;
        const response = await fetch(url);
        const body = await response.text();

        return {
          contents: body,
          // TODO(jaked) derive from file extension
          loader: "jsx",
          resolveDir: Path.dirname(new URL(response.url).pathname),
          pluginData: nestedPluginData,
        };
      });

      build.onLoad({ filter: /.*/, namespace: "repo" }, async (args) => {
        const body = await fetchRepoFile(args.path);

        return {
          contents: body,
          // TODO(jaked) derive from file extension
          loader: "jsx",
          resolveDir: Path.dirname(args.path),
          pluginData: args.pluginData,
        };
      });
    },
  };
};

export default function (props: FileBlockProps) {
  const { content, files, context, onRequestGitHubData } =
    props as FileBlockProps & { files: RepoFiles };
  const [initialized, setInitialized] = useState(false);

  const filesMap: FilesMap = new Map(
    files.map(({ path, type }) => [
      "/" + path!,
      type === "blob" ? "blob" : "tree",
    ])
  );

  const fetchRepoFile = async (path: string): Promise<string> => {
    const { owner, repo } = context;
    const url = `/repos/${owner}/${repo}/contents${path}`;
    const response = await onRequestGitHubData(url);
    const body = atob(response.content);
    return body;
  };

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
        entryPoints: ["__content__"],
        plugins: [blocksPlugin({ filesMap, context, content, fetchRepoFile })],
      })
      .then((result) => {
        if (result.outputFiles && result.outputFiles[0]) {
          eval(result.outputFiles[0].text);
        }
      });
  });

  return <div id="root" />;
}
