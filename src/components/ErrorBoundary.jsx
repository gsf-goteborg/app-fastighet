import { Component } from 'react'

/* Fångar renderingsfel i en vy så att appen inte vitnar helt vid t.ex. ett
   felaktigt datauttag. Visar ett tydligt meddelande i stället. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="errbox">
          <h2>Något gick fel i denna vy</h2>
          <p>
            Ett fel uppstod vid rendering — ofta beror det på ett felaktigt datauttag.
            Kontrollera webbläsarens konsol (och <code>validateOrigins()</code>) för detaljer.
          </p>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
          <button className="btn primary" onClick={() => this.setState({ error: null })}>Försök igen</button>
        </div>
      )
    }
    return this.props.children
  }
}
