/* Runs apps-script/Code.gs once with the mocked Google services (gas-mock.js),
   using the JavaScript engine built into macOS:

   osascript -l JavaScript run-gas.js <gas-mock.js> <Code.gs> <state.json> <post|get|setup|dump> [request.json]

   The pretend spreadsheet is loaded from and saved back to state.json, so
   successive runs behave like one continuous Google Sheet. */
ObjC.import('Foundation');

function readText(path) {
  const text = $.NSString.stringWithContentsOfFileEncodingError($(path), $.NSUTF8StringEncoding, null);
  return text.isNil() ? '' : text.js;
}

function writeText(path, text) {
  $(text).writeToFileAtomicallyEncodingError($(path), true, $.NSUTF8StringEncoding, null);
}

function run(argv) {
  const [mockPath, codePath, statePath, mode, requestPath] = argv;
  const api = (0, eval)(`${readText(mockPath)}\n${readText(codePath)}\n;({ __load, __dump, doPost, doGet, setup });`);
  api.__load(readText(statePath) || null);

  let output;
  if (mode === 'post') output = api.doPost({ postData: { contents: readText(requestPath), type: 'text/plain' } }).getContent();
  else if (mode === 'get') output = api.doGet({}).getContent();
  else if (mode === 'setup') output = JSON.stringify({ ok: true, token: api.setup() });
  else if (mode === 'dump') output = api.__dump();
  else throw new Error(`Unknown mode: ${mode}`);

  writeText(statePath, api.__dump());
  return output;
}
