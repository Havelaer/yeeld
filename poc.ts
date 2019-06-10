/*

const name = 'asdf';

const result = html`<h1>hallo ${name}</h1>`;

cosnt instance = render(result, document.getElementById('root'));

instance.bindings[0].setValue('qwer').commit();

bind(

html`...` => { template, variables, bindings }
html`...` => TemplateResult




customElements.define('primary-button', PrimaryButton, { extends: "button" });

html`<button is="primary-button">hoi</button>`


// examples

html`
    <h1>hello</h1>
    <primary-button>submit</primary-button>
`

function * Component() {
    yield html`<span>loading...</span>`;
    const { error, data } = yield call(fetch, 'http://example.com/users.json');
    yield error ? html`<span>error</span>` : html`<span>loaded!</span>`;
}

function * Component() {
    const { error, data } = yield call(query, USERS);
    yield html`<span>loaded!</span>`;
}

function * Component() {
    const node = yield html`<span>loaded!</span>`;
    // ^ SSR stops after first html`` yield
    node.addEventListener('transitionend', () => {});
}

function * Component() {
    const theme = yield useContext(ThemeContext);
    yield html`<h1 class=${theme.header}>Hello</h1>`;
}

function * Component() {
    yield html`<button onClick=${() => click('1')}>step1</button>`;
    yield waitFor('1');
    yield html`<button onClick=${() => click('2')}>step2</button>`;
    yield waitFor('2');
    yield html`<h1>Done</h1>`;
}

*/