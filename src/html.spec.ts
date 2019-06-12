import { html, render, TemplateResult } from './html';

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
    describe('string | number | string[] | number[]', () => {
        let root;

        beforeEach(() => {
            root = document.createElement('div');
        });

        it('should render plain string value', () => {
            const tmpl = title => title;

            render(tmpl('hello'), root);
            expect(root.textContent).toBe('hello');
        });

        it('should render array of plain string values', () => {
            const tmpl = title => [title, title];

            render(tmpl('hello'), root);
            expect(root.textContent).toBe('hellohello');
        });

        it('should render plain number value', () => {
            const tmpl = x => x;

            render(tmpl(1), root);
            expect(root.textContent).toBe('1');
        });

        it('should render array of number values', () => {
            const tmpl = x => [x, x];

            render(tmpl(1), root);
            expect(root.textContent).toBe('11');
        });
    });

    describe('html`` node values', () => {
        describe('string', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render string value', () => {
                const tmpl = title => html`
                    <h1>${title}</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').textContent).toBe('hello');
            });

            it('should render multiline templates', () => {
                const tmpl = (title, subtitle) => html`
                    <h1>${title}</h1>
                    <h2>${subtitle}</h2>
                `;
                render(tmpl('hello', 'world'), root);
                expect(root.querySelector('h1').textContent).toBe('hello');
                expect(root.querySelector('h2').textContent).toBe('world');
            });

            it('should render partial string value', () => {
                const tmpl = title => html`
                    <h1>foo ${title} bar</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').textContent).toBe(
                    'foo hello bar',
                );
            });

            it('should render array of strings', () => {
                const tmpl = title => html`
                    <h1>foo ${[title, '-', title]} bar</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').textContent).toBe(
                    'foo hello-hello bar',
                );
            });

            it('should escape string value', () => {
                const tmpl = title => html`
                    <h1>${title}</h1>
                `;
                render(tmpl('<span>title</span>'), root);
                expect(root.querySelector('h1').textContent).toBe(
                    '&lt;span&gt;title&lt;/span&gt;',
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
                expect(root.querySelector('h1').textContent.trim()).toBe(
                    'hallo',
                );
                expect(root.querySelector('span').textContent.trim()).toBe(
                    'hallo',
                );
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
                expect(root.querySelector('h1').textContent.trim()).toBe(
                    'hello',
                );
                expect(root.querySelector('span').textContent.trim()).toBe(
                    'hello',
                );
            });

            it('should render nested multiline templates', () => {
                const tmpl = title => html`
                    <h1>
                        ${html`
                            <strong>${title}</strong>
                            lorem
                            <span>ipsum</span>
                        `}
                    </h1>
                    <p>Paragraph</p>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('strong').textContent.trim()).toBe(
                    'hello',
                );
                expect(root.querySelector('span').textContent.trim()).toBe(
                    'ipsum',
                );
                expect(root.querySelector('p').textContent.trim()).toBe(
                    'Paragraph',
                );
            });

            it('should render multiple template results', () => {
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
                expect(lis[0].textContent.trim()).toBe('one');
                expect(lis[1].textContent.trim()).toBe('two');
            });
        });
    });

    describe('html`` attribute values', () => {
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

    describe('string', () => {
        it('should only update string values, not the text node', () => {
            const fn = title => title;

            render(fn('hello1'), root);
            const textNode1 = root.firstChild;
            expect(root.textContent).toBe('hello1');

            render(fn('hello2'), root);
            const textNode2 = root.firstChild;
            expect(root.textContent).toBe('hello2');
            expect(textNode1).toBe(textNode2);
        });
    });

    describe('html`` node values', () => {
        describe('string', () => {
            it('should only update template result values', () => {
                const fn = title => html`
                    <h1>${title}</h1>
                `;

                render(fn('hello'), root);
                const node1 = root.querySelector('h1');

                render(fn('hello2'), root);
                const node2 = root.querySelector('h1');

                expect(node1).toBe(node2);
                expect(node2.textContent).toBe('hello2');
            });

            xit('should handle updating different value types', () => {
                const fn = content =>
                    html`<div>${content}</div>`;

                render(fn('one'), root);
                expect(root.textContent).toBe('one');

                render(fn(html`<span>two</span>`), root);
                /* debug */ console.log('root.innerHTML', root.innerHTML);
                expect(root.textContent).toBe('two');
            });
        });
    });
});
