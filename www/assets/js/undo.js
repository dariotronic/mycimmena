import { showErrorToast, showToast } from './toasts.js';

// Rimozioni annullabili: l'effetto si vede subito, il salvataggio parte dopo UNDO_DELAY_MS se nessuno preme "Annulla".
// Così annullare non costa un secondo salvataggio e non serve una conferma. Se la pagina si chiude prima,
// il salvataggio parte subito (pagehide).
const UNDO_DELAY_MS = 5000;

export function createUndo({ render }) {
	let pendingUndoable = null;

	function runUndoable({ apply, revert, commit, toastKey }) {
		flushUndoable();
		apply();
		render();
		const action = { revert, commit };
		action.timer = window.setTimeout(() => flushUndoable(), UNDO_DELAY_MS);
		pendingUndoable = action;
		showToast(toastKey, {}, {
			label: 'Annulla',
			duration: UNDO_DELAY_MS,
			onClick: () => {
				if (pendingUndoable !== action) return;
				window.clearTimeout(action.timer);
				pendingUndoable = null;
				revert();
				render();
			}
		});
	}

	function flushUndoable(keepalive = false) {
		const action = pendingUndoable;
		if (!action) return Promise.resolve();
		pendingUndoable = null;
		window.clearTimeout(action.timer);
		return action.commit(keepalive).catch(error => {
			action.revert();
			render();
			showErrorToast(error);
		});
	}
	window.addEventListener('pagehide', () => flushUndoable(true));

	return { runUndoable, flushUndoable };
}
