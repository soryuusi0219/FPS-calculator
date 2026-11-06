import 'katex/dist/katex.min.css';
import './styles/index.css';
import { mountCalculator } from './app/controller.ts';

mountCalculator(document.querySelector<HTMLElement>('#app')!);
