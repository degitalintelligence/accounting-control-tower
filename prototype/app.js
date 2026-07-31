const modal = document.querySelector('#taskModal');
const toast = document.querySelector('#toast');
const showToast = (message) => {
  toast.querySelector('p').textContent = message;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
};

document.querySelector('#newTask').addEventListener('click', () => modal.classList.add('open'));
document.querySelectorAll('.closeModal').forEach(button => button.addEventListener('click', () => modal.classList.remove('open')));
modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('open'); });
document.querySelector('.createTask').addEventListener('click', () => {
  modal.classList.remove('open');
  showToast(`Task “${document.querySelector('#taskTitle').value}” created and assigned`);
});

document.querySelector('.confirmSuggestion').addEventListener('click', event => {
  const card = event.target.closest('.wa-card');
  card.style.opacity = '.45';
  card.style.pointerEvents = 'none';
  event.target.textContent = '✓ Task confirmed';
  showToast('WhatsApp suggestion confirmed as ADH-1124');
});
document.querySelector('.rejectSuggestion').addEventListener('click', event => {
  event.target.closest('.wa-card').remove();
  showToast('Suggestion dismissed — feedback recorded');
});
document.querySelector('.editSuggestion').addEventListener('click', () => {
  document.querySelector('#taskTitle').value = 'Investigate vendor ABC invoice variance';
  modal.classList.add('open');
});

document.querySelector('.tree-toggle').addEventListener('click', event => {
  const children = document.querySelector('#bankChildren');
  const hidden = children.style.display === 'none';
  children.style.display = hidden ? 'block' : 'none';
  event.target.textContent = hidden ? '⌄' : '›';
});
document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.toast)));
document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  if (button.dataset.view !== 'dashboard') showToast(`${button.textContent.trim()} is included in the next prototype view`);
}));
document.querySelector('#mobileMenu').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
document.addEventListener('keydown', event => { if (event.key === 'Escape') modal.classList.remove('open'); });
