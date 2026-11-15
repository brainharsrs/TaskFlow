// TaskFlow — relatório de produtividade (plano Pro). Um gráfico responde a uma pergunta.
import { byId, h } from './dom.js';
import { stagger } from './motion.js';
import { fromISODate } from '../core/domain.js';

const number = (value, digits = 0) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
const shortDate = iso => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(fromISODate(iso));

const stat = (label, value, caption) => h('article', { class: 'tile' },
  h('h3', {}, label),
  h('p', { class: 'tile-value' }, value),
  caption && h('p', { class: 'tile-caption' }, caption));

/** Bloqueio para o plano gratuito: diz o que o relatório mostra, sem inventar números. */
function renderLocked(onUpgrade) {
  return [h('div', { class: 'empty' },
    h('h3', {}, 'O relatório faz parte do Pro'),
    h('p', {}, 'Veja quantas tarefas você concluiu em 30 dias, em quais espaços, qual é o seu melhor dia da semana e quantas entregou dentro do prazo.'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: onUpgrade }, 'Conhecer o Pro'))];
}

export function renderReport(report, { pro, onUpgrade, colorOf, animate }) {
  const body = byId('reportBody');
  if (!pro) { body.replaceChildren(...renderLocked(onUpgrade)); return; }

  if (report.total === 0) {
    body.replaceChildren(h('div', { class: 'empty' },
      h('h3', {}, 'Ainda não há dados para o relatório'),
      h('p', {}, 'Conclua algumas tarefas e volte aqui: o relatório considera os últimos 30 dias.')));
    return;
  }

  const first = report.series[0].iso;
  const last = report.series.at(-1).iso;
  const chart = h('div', { class: 'chart', role: 'img', 'aria-label': `Tarefas concluídas por dia, de ${shortDate(first)} a ${shortDate(last)}. Total: ${report.total}. Maior dia: ${report.max}.` },
    h('div', { class: 'chart-scale', 'aria-hidden': 'true' }, h('span', {}, String(report.max)), h('span', {}, '0')),
    h('div', { class: 'chart-bars' }, report.series.map(day => {
      const bar = h('i', { class: 'chart-bar', title: `${shortDate(day.iso)}: ${day.count}`, dataset: { empty: String(day.count === 0), last: String(day.iso === last) } });
      bar.style.setProperty('--v', String(day.count / report.max));
      return bar;
    })),
    h('div', { class: 'chart-axis', 'aria-hidden': 'true' }, h('span', {}, shortDate(first)), h('span', {}, shortDate(last))));

  const spaceMax = Math.max(1, ...report.bySpace.map(space => space.count));
  const spaces = h('ul', { class: 'hbars' }, report.bySpace.map(space => {
    const fill = h('span', { class: 'hbar-fill' });
    fill.style.setProperty('--v', String(space.count / spaceMax));
    return h('li', { class: 'hbar' },
      h('span', { class: 'hbar-name' }, h('i', { class: 'dot', dataset: { color: colorOf(space.name) } }), space.name),
      h('span', { class: 'hbar-track' }, fill),
      h('span', { class: 'hbar-n' }, String(space.count)));
  }));

  const nodes = [
    h('div', { class: 'report-stats' },
      stat('Concluídas', number(report.total), `em ${report.activeDays} ${report.activeDays === 1 ? 'dia ativo' : 'dias ativos'}`),
      stat('Média por dia', number(report.average, 1), 'considerando os 30 dias'),
      stat('Melhor dia da semana', report.bestWeekday.name, `${report.bestWeekday.count} ${report.bestWeekday.count === 1 ? 'conclusão' : 'conclusões'}`),
      stat('Dentro do prazo', report.onTimeRate === null ? '—' : `${number(report.onTimeRate * 100)}%`, report.onTimeRate === null ? 'nenhuma concluída tinha prazo' : 'das concluídas que tinham prazo')),
    h('article', { class: 'tile' }, h('h3', {}, 'Concluídas por dia'), chart),
    h('article', { class: 'tile' }, h('h3', {}, 'Concluídas por espaço'), spaces)
  ];
  body.replaceChildren(...nodes);
  if (animate) stagger(nodes, { step: 70 });
}
