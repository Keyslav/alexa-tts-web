from flask import Flask
import database


def create_app() -> Flask:
    """Application Factory — padrão recomendado pelo Flask."""
    app = Flask(__name__)
    database.init_db()

    from blueprints.views import views_bp
    from blueprints.api import api_bp

    app.register_blueprint(views_bp)
    app.register_blueprint(api_bp, url_prefix="/api")

    return app


# Instância exposta no módulo para compatibilidade com gunicorn (app:app)
app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
