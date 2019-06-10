import { html, render, TemplateResult } from '../app.js';

function triggerEvent(elem, event) {
    const clickEvent = new Event(event); // Create the event.
    elem.dispatchEvent(clickEvent); // Dispatch the event.
}

describe('html', () => {
    it('should return TemplateResult', () => {
        const fn = x => html`
            <h1>${x}</h1>
        `;
        const result = fn(1);
        expect(result.constructor).toBe(TemplateResult);
        expect(result.values[0]).toBe(1);
    });

    it('should return the same template reference given identical string template', () => {
        const fn = x => html`
            <h1>${x}</h1>
        `;
        const result1 = fn(1);
        const result2 = fn(2);
        expect(result1.template).toBe(result2.template);
    });
});

describe('render', () => {
    describe('Element', () => {
        describe('TextNode', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render node text value', () => {
                const tmpl = title => html`
                    <h1>${title}</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').innerText).toBe('hello');
            });

            it('should render node text value', () => {
                const tmpl = title => html`
                    <h1>foo ${title} bar</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').innerText).toBe(
                    'foo hello bar',
                );
            });
        });

        describe('TemplateResult', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render plain single template result', () => {
                const tmpl = () => html`
                    <h1>
                        ${html`
                            <span>hallo</span>
                        `}
                    </h1>
                `;
                render(tmpl(), root);
                /* debug */ console.log('*** tests:68 root', root);
                expect(root.querySelector('h1').innerText.trim()).toBe('hallo');
                expect(root.querySelector('span').innerText.trim()).toBe('hallo');
            });

            it('should render single template result with values', () => {
                const tmpl = title => html`
                    <h1>
                        ${html`
                            <span>${title}</span>
                        `}
                    </h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').innerText.trim()).toBe('hello');
                expect(root.querySelector('span').innerText.trim()).toBe('hello');
            });

            it('should render node text value', () => {
                const tmpl = title => html`
                    <ul>
                        ${['one', 'two'].map(
                            i =>
                                html`
                                    <li>${i}</li>
                                `,
                        )}
                    </ul>
                `;
                render(tmpl('hello'), root);
                const lis = root.querySelectorAll('li');
                expect(lis.length).toBe(2);
                expect(lis[0].innerText.trim()).toBe('one');
            });
        });
    });

    describe('Attribute', () => {
        describe('text', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render attribute text value without quotes', () => {
                const tmpl = title => html`
                    <h1 title=${title}>hello</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').getAttribute('title')).toBe(
                    'hello',
                );
            });

            it('should render attribute text value with quotes', () => {
                const tmpl = title => html`
                    <h1 title="${title}">hello</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').getAttribute('title')).toBe(
                    'hello',
                );
            });

            it('should render attribute inline text value', () => {
                const tmpl = title => html`
                    <h1 title="foo ${title} bar">hello</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').getAttribute('title')).toBe(
                    'foo hello bar',
                );
            });

            it('should render attribute text with multiple values', () => {
                const tmpl = (val1, val2) => html`
                    <h1 title="foo ${val1} bar ${val2} qaz">hello</h1>
                `;
                render(tmpl('aaa', 'bbb'), root);
                expect(root.querySelector('h1').getAttribute('title')).toBe(
                    'foo aaa bar bbb qaz',
                );
            });
        });

        describe('function', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should attach event listener', () => {
                let counter = 0;
                const fn = () => counter++;
                const tmpl = fn => html`
                    <button onclick=${fn}>hello</button>
                `;
                render(tmpl(fn), root);
                const button = root.querySelector('button');
                triggerEvent(button, 'click');
                expect(counter).toBe(1);
            });
        });
    });
});

describe('update', () => {
    let root;

    beforeEach(() => {
        root = document.createElement('div');
    });

    it('should only update values', () => {
        const fn = title =>
            html`
                <h1>${title}</h1>
            `;

        render(fn('hello'), root);
        const node1 = root.querySelector('h1');

        render(fn('hello2'), root);
        const node2 = root.querySelector('h1');

        expect(node1).toBe(node2);
        expect(node2.innerText).toBe('hello2');
    });
});
