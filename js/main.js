(function () {
  var form = document.getElementById('newsletter-form');
  if (!form) return;
  var input = document.getElementById('email');
  var error = document.getElementById('email-error');
  var success = document.getElementById('form-success');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var valid = input.value.trim() !== '' && input.checkValidity();
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    error.classList.toggle('is-visible', !valid);
    success.classList.toggle('is-visible', valid);
    if (!valid) {
      input.focus();
    } else {
      form.reset();
    }
  });
})();
