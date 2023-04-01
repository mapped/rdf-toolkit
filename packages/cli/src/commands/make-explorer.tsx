import renderHTML, { HtmlContent } from "@rdf-toolkit/explorer-views/jsx/html";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import cssAssetFilePath from "../assets/explorer/explorer.min.css";
import scriptAssetFilePath from "../assets/explorer/explorer.min.js";
import fontAssetFilePath from "../assets/explorer/iosevka-aile-custom-light.woff2";
import workerScriptAssetFilePath from "../assets/explorer/worker.min.js";
import { MakeOptions, ProjectOptions } from "../options.js";
import { Project } from "../project.js";
import { Site } from "../site.js";

type Options =
    & MakeOptions
    & ProjectOptions

const DEFAULT_TITLE = "RDF Explorer";

const INDEX_FILE_NAME = "index.html";
const CSS_FILE_NAME = path.basename(cssAssetFilePath);
const FONT_FILE_NAME = path.basename(fontAssetFilePath);
const SCRIPT_FILE_NAME = path.basename(scriptAssetFilePath);
const WORKER_SCRIPT_FILE_NAME = path.basename(workerScriptAssetFilePath);

class Website {
    readonly files: Record<string, { readonly fileName: string, readonly contentType: string, readonly buffer: Buffer }> = {};

    constructor(readonly title: string) {
    }

    add(documentURI: string, filePath: string): void {
        const buffer = fs.readFileSync(filePath);

        const info = /[.](?:md|mkdn?|mdwn|mdown|markdown)$/i.test(filePath) ? {
            contentType: "text/markdown",
            fileExtension: "md"
        } : {
            contentType: "text/turtle",
            fileExtension: "ttl"
        };

        this.files[documentURI] = {
            fileName: `${path.parse(filePath).name}.${crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12)}.${info.fileExtension}`,
            contentType: info.contentType,
            buffer,
        };
    }
}

function renderIndex(context: Website, links: HtmlContent, scripts: HtmlContent): HtmlContent {
    return <html lang="en-US">
        <head>
            <meta charset="utf-8" />
            <title>{context.title}</title>
            {links}
            <link rel="preload" type="font/woff2" href={FONT_FILE_NAME} as="font" crossorigin="anonymous" />
            <link rel="preload" type="application/javascript" href={WORKER_SCRIPT_FILE_NAME} as="worker" crossorigin="anonymous" />
            {Object.entries(context.files).map(([documentURI, item]) => <link rel="preload" type={item.contentType} href={item.fileName} as="fetch" crossorigin="anonymous" data-uri={documentURI} />)}
        </head>
        <body>
            <noscript>Your browser does not support JavaScript or scripts are being blocked.</noscript>
            {scripts}
        </body>
    </html>;
}

export default function main(options: Options): void {
    const moduleFilePath = url.fileURLToPath(import.meta.url);
    const modulePath = path.dirname(moduleFilePath);

    const project = Project.from(options.project);
    const files = project.config.files || {};
    const icons = project.config.siteOptions?.icons || [];
    const assets = project.config.siteOptions?.assets || {};
    const context = new Website(project.config.siteOptions?.title || DEFAULT_TITLE);
    const site = new Site(project, options.output);

    for (const documentURI in files) {
        context.add(documentURI, project.resolve(files[documentURI]));
    }

    const links = <>
        {icons.map(iconConfig => <link rel="icon" type={iconConfig.type} sizes={iconConfig.sizes} href={path.basename(iconConfig.asset)} />)}
        <link rel="stylesheet" href={CSS_FILE_NAME} />
    </>;

    const scripts = <>
        <script src={SCRIPT_FILE_NAME}></script>
    </>;

    site.write(CSS_FILE_NAME, fs.readFileSync(path.resolve(modulePath, cssAssetFilePath)));
    site.write(FONT_FILE_NAME, fs.readFileSync(path.resolve(modulePath, fontAssetFilePath)));
    site.write(SCRIPT_FILE_NAME, fs.readFileSync(path.resolve(modulePath, scriptAssetFilePath)));
    site.write(WORKER_SCRIPT_FILE_NAME, fs.readFileSync(path.resolve(modulePath, workerScriptAssetFilePath)));

    for (const iconConfig of icons) {
        site.write(path.basename(iconConfig.asset), project.read(iconConfig.asset));
    }

    for (const filePath in assets) {
        site.write(assets[filePath], project.read(filePath));
    }

    site.write(INDEX_FILE_NAME, Buffer.from("<!DOCTYPE html>\n" + renderHTML(renderIndex(context, links, scripts))));

    for (const item of Object.values(context.files)) {
        site.write(item.fileName, item.buffer);
    }
}