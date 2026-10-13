/* eslint-env jquery */
$(document).ready(function () {
  $(".modal").modal();

  function showError() {
    window.alert("The request could not be completed. Please try again.");
  }

  $(".cart-button").on("click", function (event) {
    event.preventDefault();
    event.stopPropagation();

    var button = $(this);
    if (button.data("busy")) return;
    button.data("busy", true);

    $.ajax({
      url: "/api/cart",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ bookId: Number(button.attr("value")) }),
      timeout: 7000
    })
      .done(function () { location.reload(); })
      .fail(showError)
      .always(function () { button.data("busy", false); });
  });

  $(".checkout-button").on("click", function (event) {
    event.preventDefault();

    $.ajax({
      url: "/api/cart/delete",
      method: "DELETE",
      timeout: 7000
    })
      .done(function () { location.reload(); })
      .fail(showError);
  });
});
