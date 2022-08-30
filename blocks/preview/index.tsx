import Path from "path-browserify";
import { useEffect, useState } from "react";
import * as esbuild from "esbuild-wasm";
import { FileBlockProps, RepoFiles } from "@githubnext/blocks";

// with grateful thanks to https://github.com/lukedxvxes/esbuild-in-browser/

// leaving this @radix-ui stuff here for the future but it doesn't work

// fetching dependencies from unpkg only works in simple cases since it doesn't
// consider versions. to do a good job I think we'd need to parse the
// `package.json`s and fetch the appropriate version for the resolution context.

const radixUiPaths: Record<string, string[]> = {
  "@radix-ui/number": ["./packages/core/number/src"],
  "@radix-ui/primitive": ["./packages/core/primitive/src"],
  "@radix-ui/rect": ["./packages/core/rect/src"],
  "@radix-ui/react-accessible-icon": ["./packages/react/accessible-icon/src"],
  "@radix-ui/react-accordion": ["./packages/react/accordion/src"],
  "@radix-ui/react-alert-dialog": ["./packages/react/alert-dialog/src"],
  "@radix-ui/react-announce": ["./packages/react/announce/src"],
  "@radix-ui/react-arrow": ["./packages/react/arrow/src"],
  "@radix-ui/react-aspect-ratio": ["./packages/react/aspect-ratio/src"],
  "@radix-ui/react-avatar": ["./packages/react/avatar/src"],
  "@radix-ui/react-checkbox": ["./packages/react/checkbox/src"],
  "@radix-ui/react-collapsible": ["./packages/react/collapsible/src"],
  "@radix-ui/react-collection": ["./packages/react/collection/src"],
  "@radix-ui/react-compose-refs": ["./packages/react/compose-refs/src"],
  "@radix-ui/react-context": ["packages/react/context/src"],
  "@radix-ui/react-context-menu": ["packages/react/context-menu/src"],
  "@radix-ui/react-dialog": ["./packages/react/dialog/src"],
  "@radix-ui/react-direction": ["./packages/react/direction/src"],
  "@radix-ui/react-dismissable-layer": [
    "./packages/react/dismissable-layer/src",
  ],
  "@radix-ui/react-dropdown-menu": ["packages/react/dropdown-menu/src"],
  "@radix-ui/react-focus-guards": ["packages/react/focus-guards/src"],
  "@radix-ui/react-focus-scope": ["./packages/react/focus-scope/src"],
  "@radix-ui/react-hover-card": ["./packages/react/hover-card/src"],
  "@radix-ui/react-id": ["./packages/react/id/src"],
  "@radix-ui/react-label": ["./packages/react/label/src"],
  "@radix-ui/react-menu": ["./packages/react/menu/src"],
  "@radix-ui/react-navigation-menu": ["./packages/react/navigation-menu/src"],
  "@radix-ui/react-popover": ["./packages/react/popover/src"],
  "@radix-ui/react-popper": ["./packages/react/popper/src"],
  "@radix-ui/react-portal": ["./packages/react/portal/src"],
  "@radix-ui/react-presence": ["./packages/react/presence/src"],
  "@radix-ui/react-primitive": ["./packages/react/primitive/src"],
  "@radix-ui/react-progress": ["packages/react/progress/src"],
  "@radix-ui/react-radio-group": ["./packages/react/radio-group/src"],
  "@radix-ui/react-roving-focus": ["./packages/react/roving-focus/src"],
  "@radix-ui/react-scroll-area": ["./packages/react/scroll-area/src"],
  "@radix-ui/react-select": ["./packages/react/select/src"],
  "@radix-ui/react-separator": ["./packages/react/separator/src"],
  "@radix-ui/react-slider": ["./packages/react/slider/src"],
  "@radix-ui/react-slot": ["./packages/react/slot/src"],
  "@radix-ui/react-switch": ["./packages/react/switch/src"],
  "@radix-ui/react-tabs": ["./packages/react/tabs/src"],
  "@radix-ui/react-toast": ["./packages/react/toast/src"],
  "@radix-ui/react-toggle": ["./packages/react/toggle/src"],
  "@radix-ui/react-toggle-group": ["./packages/react/toggle-group/src"],
  "@radix-ui/react-toolbar": ["./packages/react/toolbar/src"],
  "@radix-ui/react-tooltip": ["./packages/react/tooltip/src"],
  "@radix-ui/react-use-callback-ref": ["./packages/react/use-callback-ref/src"],
  "@radix-ui/react-use-controllable-state": [
    "./packages/react/use-controllable-state/src",
  ],
  "@radix-ui/react-use-escape-keydown": [
    "./packages/react/use-escape-keydown/src",
  ],
  "@radix-ui/react-use-layout-effect": [
    "./packages/react/use-layout-effect/src",
  ],
  "@radix-ui/react-use-previous": ["./packages/react/use-previous/src"],
  "@radix-ui/react-use-rect": ["./packages/react/use-rect/src"],
  "@radix-ui/react-use-size": ["./packages/react/use-size/src"],
  "@radix-ui/react-visually-hidden": ["./packages/react/visually-hidden/src"],
};

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
  onRequestGitHubData,
}: {
  filesMap: FilesMap;
  context: FileBlockProps["context"];
  content: string;
  onRequestGitHubData: FileBlockProps["onRequestGitHubData"];
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
          const resolveDir = Path.dirname(context.path);
          return {
            contents: content,

            // TODO(jaked) derive from file extension
            loader: "jsx",
            resolveDir,
          };
        }
      );

      build.onResolve({ filter: /^@radix-ui/ }, (args) => {
        const resolvedPath = resolvePathInFilesMap(
          radixUiPaths[args.path][0].substring(1),
          filesMap
        );

        return {
          path: resolvedPath,
          namespace: "repo",
        };
      });

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
        };
      });

      // other imports go to unpkg
      build.onResolve({ filter: /.*/ }, (args) => {
        return {
          path: args.path,
          namespace: "unpkg",
        };
      });

      build.onLoad({ filter: /.*/, namespace: "unpkg" }, async (args) => {
        const url = `https://unpkg.com${args.path.startsWith("/") ? "" : "/"}${
          args.path
        }`;
        const response = await fetch(url);
        const body = await response.text();

        return {
          contents: body,
          // TODO(jaked) derive from file extension
          loader: "jsx",
          resolveDir: Path.dirname(new URL(response.url).pathname),
        };
      });

      build.onLoad({ filter: /.*/, namespace: "repo" }, async (args) => {
        const { owner, repo } = context;
        const url = `/repos/${owner}/${repo}/contents/${args.path}`;
        const response = await onRequestGitHubData(url);
        const body = atob(response.content);

        return {
          contents: body,
          // TODO(jaked) derive from file extension
          loader: "jsx",
          resolveDir: Path.dirname(args.path),
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
        plugins: [
          blocksPlugin({ filesMap, context, content, onRequestGitHubData }),
        ],
      })
      .then((result) => {
        if (result.outputFiles && result.outputFiles[0]) {
          eval(result.outputFiles[0].text);
        }
      });
  });

  return <div id="root" />;
}
