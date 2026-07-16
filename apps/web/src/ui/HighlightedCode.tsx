import { Highlight, themes } from "prism-react-renderer";

export function HighlightedCode({
  code,
  language,
  className,
}: {
  code: string;
  language: string;
  className?: string;
}) {
  return (
    <Highlight theme={themes.vsDark} code={code || " "} language={language}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <span className={className}>
          {tokens.map((line, lineIndex) => (
            <span {...getLineProps({ line })} className="syntax-line" key={lineIndex}>
              {line.map((token, tokenIndex) => (
                <span {...getTokenProps({ token })} key={tokenIndex} />
              ))}
            </span>
          ))}
        </span>
      )}
    </Highlight>
  );
}
