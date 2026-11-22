// Navigazione: vista corrente, menu e "torna su".

export const route = () => (location.hash.replace(/^#\/?/, '') || 'home');

export function updateBackToTopButton() {
	const button = document.getElementById('back-to-top');
	if (button) button.hidden = window.scrollY <= 300;
}

export function createNavigation({ app }) {
	const menu = document.getElementById('site-menu');
	const menuToggle = document.getElementById('menu-toggle');
	window.addEventListener('scroll', updateBackToTopButton, { passive: true });
	app.addEventListener('click', event => {
		if (event.target.closest('#back-to-top')) window.scrollTo({ top: 0, behavior: 'smooth' });
	});
	menuToggle.addEventListener('click', () => {
		const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
		menuToggle.setAttribute('aria-expanded', String(!expanded));
		menu.hidden = expanded;
	});
	function closeMenu() {
		menu.hidden = true;
		menuToggle.setAttribute('aria-expanded', 'false');
	}
	menu.addEventListener('click', event => {
		if (event.target.closest('a')) closeMenu();
	});
	document.addEventListener('click', event => {
		if (!menu.hidden && !menu.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
	});
	document.addEventListener('keydown', event => {
		if (event.key === 'Escape' && !menu.hidden) {
			closeMenu();
			menuToggle.focus();
		}
	});
	return { closeMenu };
}
