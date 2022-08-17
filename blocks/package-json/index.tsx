import { FileBlockProps } from "@githubnext/blocks";
import { ActionList } from "@primer/react";
import { LinkIcon } from "@primer/octicons-react";

export default function (props: FileBlockProps) {
  const { content } = props;

  const packageJson = JSON.parse(content);
  const dependencies = Object.entries(packageJson.dependencies);

  return (
    <ActionList>
      {dependencies.map((dep) => (
        <ActionList.LinkItem
          href={`https://npmjs.com/${dep[0]}`}
          target="_blank"
        >
          <ActionList.LeadingVisual>
            <LinkIcon />
          </ActionList.LeadingVisual>
          {dep[0]}
          <ActionList.TrailingVisual>
            {dep[1] as string}
          </ActionList.TrailingVisual>
        </ActionList.LinkItem>
      ))}
    </ActionList>
  );
}
